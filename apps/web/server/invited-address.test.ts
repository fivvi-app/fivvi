import { createHash } from 'node:crypto';
import { type ApiDependencies, createApiHandler, NO_DEPENDENCIES } from '@fivvi/api';
import { describe, expect, it } from 'vitest';
import { inProcessApiClient } from './api-client';
import { invitedAddress } from './invited-address';

// The generated client calls the real API handler in-process (as me.test.ts does), with a
// stand-in for the database: the invitation scope opens for one token and says what the read
// tells. The API's own answers for a valid, expired, used, withdrawn or unknown token are tested
// in packages/api/test/invitation-accept.integration.test.ts; here the sign-in page's use of them.
const PREVIEW = {
  workspaceName: "John's Gym",
  inviterName: 'John',
  email: 'lisa@example.com',
  maskedEmail: 'l***@example.com',
  forYou: false,
};

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

function api(options: { validToken?: string; down?: boolean } = {}) {
  const sessionReads: Headers[] = [];
  const scopeInputs: { tokenHash: string; accountId?: string }[] = [];
  const tenantScopes: ApiDependencies['tenantScopes'] = {
    ...NO_DEPENDENCIES.tenantScopes,
    inInvitationScope: (input) => {
      scopeInputs.push({ tokenHash: input.tokenHash, accountId: input.accountId });
      if (options.down) return Promise.reject(new Error('The database is down.'));
      return Promise.resolve(
        input.tokenHash === hash(options.validToken ?? 'valid-token')
          ? { status: 'entered', value: PREVIEW }
          : { status: 'unknown' },
      ) as never;
    },
  };
  const handle = createApiHandler({
    ...NO_DEPENDENCIES,
    tenantScopes,
    findSignedInAccount: (headers) => {
      sessionReads.push(headers);
      return Promise.resolve(undefined);
    },
  });
  return { client: inProcessApiClient(handle), sessionReads, scopeInputs };
}

describe('F011 TW-10 opens with the invited address (#1413)', () => {
  it('AC1: a return path to an invitation gives the address the invitation read tells', async () => {
    const { client, sessionReads, scopeInputs } = api();

    expect(await invitedAddress(client, '/invitations/valid-token')).toBe('lisa@example.com');

    expect(scopeInputs).toEqual([{ tokenHash: hash('valid-token'), accountId: undefined }]);
    // Nobody is signed in on the sign-in page: no cookie or authorization goes along.
    expect(sessionReads).toHaveLength(1);
    expect(sessionReads[0]?.get('cookie')).toBeNull();
    expect(sessionReads[0]?.get('authorization')).toBeNull();
  });

  it('AC1: a token with characters that were escaped in the link is read as it was', async () => {
    const { client } = api({ validToken: 'a b' });

    expect(await invitedAddress(client, `/invitations/${encodeURIComponent('a b')}`)).toBe(
      'lisa@example.com',
    );
  });

  it('AC2: an expired, used, withdrawn or unknown token (the neutral 404) gives no address', async () => {
    const { client } = api();

    expect(await invitedAddress(client, '/invitations/not-a-token')).toBeUndefined();
  });

  it('AC2: no return path, or one that is not an invitation, asks nothing and gives no address', async () => {
    const { client, scopeInputs, sessionReads } = api();

    for (const path of [
      undefined,
      '/home',
      '/w/gym/trainers',
      '/invitations',
      '/invitations/',
      '/invitations/valid-token/accept',
      '/invitations/valid-token/extra/more',
      '/invitations/%E0%A4%A',
    ]) {
      expect(await invitedAddress(client, path), String(path)).toBeUndefined();
    }
    expect(scopeInputs).toHaveLength(0);
    expect(sessionReads).toHaveLength(0);
  });

  it('a failing read leaves the field empty instead of breaking the sign-in page', async () => {
    const down = api({ down: true });
    expect(await invitedAddress(down.client, '/invitations/valid-token')).toBeUndefined();
    expect(down.scopeInputs).toHaveLength(1);

    const broken = inProcessApiClient(() => Promise.reject(new Error('down')));
    expect(await invitedAddress(broken, '/invitations/valid-token')).toBeUndefined();
  });
});

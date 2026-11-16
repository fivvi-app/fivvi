import { describe, expect, it } from 'vitest';
import { inProcessApiClient } from './api-client';
import { invitedAddress } from './invited-address';

// The generated client calls a stand-in handler in-process (as me.test.ts does). The API's own
// answers for a valid, expired, used, withdrawn or unknown token are tested in
// packages/api/test/invitation-accept.integration.test.ts; here the sign-in page's use of them.
const PREVIEW = {
  workspaceName: "John's Gym",
  inviterName: 'John',
  email: 'lisa@example.com',
  maskedEmail: 'l***@example.com',
  forYou: false,
};

function api(answer: (token: string) => Response) {
  const requests: Request[] = [];
  const client = inProcessApiClient((request) => {
    requests.push(request);
    const token = decodeURIComponent(new URL(request.url).pathname.split('/').at(-1) ?? '');
    return answer(token);
  });
  return { client, requests };
}

const valid = (token: string) =>
  token === 'valid-token'
    ? Response.json(PREVIEW)
    : Response.json({ code: 'not_found' }, { status: 404 });

describe('F011 TW-10 opens with the invited address (#1413)', () => {
  it('AC1: a return path to an invitation gives the address the invitation read tells', async () => {
    const { client, requests } = api(valid);

    expect(await invitedAddress(client, '/invitations/valid-token')).toBe('lisa@example.com');

    expect(requests).toHaveLength(1);
    // Nobody is signed in on the sign-in page: no cookie or authorization goes along.
    expect(requests[0]?.headers.get('cookie')).toBeNull();
    expect(requests[0]?.headers.get('authorization')).toBeNull();
  });

  it('AC1: a token with characters that were escaped in the link is read as it was', async () => {
    const { client } = api((token) =>
      token === 'a b' ? Response.json(PREVIEW) : Response.json({}, { status: 404 }),
    );

    expect(await invitedAddress(client, `/invitations/${encodeURIComponent('a b')}`)).toBe(
      'lisa@example.com',
    );
  });

  it('AC2: an expired, used, withdrawn or unknown token (the neutral 404) gives no address', async () => {
    const { client } = api(valid);

    expect(await invitedAddress(client, '/invitations/not-a-token')).toBeUndefined();
  });

  it('AC2: no return path, or one that is not an invitation, asks nothing and gives no address', async () => {
    const { client, requests } = api(valid);

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
    expect(requests).toHaveLength(0);
  });

  it('a failing read leaves the field empty instead of breaking the sign-in page', async () => {
    const down = api(() => Response.json({}, { status: 500 }));
    expect(await invitedAddress(down.client, '/invitations/valid-token')).toBeUndefined();

    const broken = inProcessApiClient(() => Promise.reject(new Error('down')));
    expect(await invitedAddress(broken, '/invitations/valid-token')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  type CallFacts,
  expectedCall,
  mayChangeRow,
  mayShow,
  mustShow,
  type XAccess,
} from './expectations.ts';

const ownerOnly: XAccess = { type: 'workspace', roles: ['owner'], client: 'none' };
const team: XAccess = { type: 'workspace', roles: ['owner', 'trainer'], client: 'none' };
const ownRecords: XAccess = { type: 'workspace', roles: [], client: 'own-records' };
const everyone: XAccess = { type: 'workspace', roles: ['owner', 'trainer'], client: 'own-records' };

const call = (access: XAccess, rest: Partial<CallFacts> = {}): CallFacts => ({
  access,
  method: 'GET',
  workspaceId: 'a',
  signedIn: true,
  places: {},
  record: 'none',
  ...rest,
});

describe('the expected answer of a route, from its access and the caller’s place', () => {
  it.each([
    ['anonymous', ownerOnly, { signedIn: false }, 401],
    ['no place in the workspace', team, { places: { b: { teamRole: 'owner' } } }, 404],
    [
      'a trainer on an owner-only route',
      ownerOnly,
      { places: { a: { teamRole: 'trainer' } } },
      403,
    ],
    ['a client on a team route', team, { places: { a: { clientId: 'c1' } } }, 403],
    ['a team member on a client route', ownRecords, { places: { a: { teamRole: 'owner' } } }, 403],
    [
      'an owner on an owner-only route',
      ownerOnly,
      { places: { a: { teamRole: 'owner' } } },
      'success',
    ],
    ['a trainer on a team route', team, { places: { a: { teamRole: 'trainer' } } }, 'success'],
    ['a client on a client route', ownRecords, { places: { a: { clientId: 'c1' } } }, 'success'],
  ] as const)('%s', (_name, access, facts, status) => {
    expect(expectedCall(call(access, facts as Partial<CallFacts>)).status).toBe(status);
  });

  it('answers a record of another workspace, or of another client, 404 where the caller may call the route', () => {
    const owner = { places: { a: { teamRole: 'owner' as const } } };
    const client = { places: { a: { clientId: 'c1' } } };

    expect(expectedCall(call(team, { ...owner, record: 'foreign-workspace' })).status).toBe(404);
    expect(expectedCall(call(ownRecords, { ...client, record: 'foreign-workspace' })).status).toBe(
      404,
    );
    expect(expectedCall(call(ownRecords, { ...client, record: 'other-client' })).status).toBe(404);
    expect(expectedCall(call(ownRecords, { ...client, record: 'own' })).status).toBe('success');
    // A team member sees every client of the workspace.
    expect(expectedCall(call(team, { ...owner, record: 'other-client' })).status).toBe('success');
    // The access comes first: a refused caller learns nothing about the record.
    expect(
      expectedCall(
        call(ownerOnly, { places: { a: { teamRole: 'trainer' } }, record: 'foreign-workspace' }),
      ).status,
    ).toBe(403);
  });

  it('runs a trainer who is also a client as a trainer, and as a client only where the route needs it', () => {
    const both = { places: { a: { teamRole: 'trainer' as const, clientId: 'c1' } } };

    expect(expectedCall(call(everyone, both)).hat).toBe('team');
    expect(expectedCall(call(ownRecords, both)).hat).toBe('client');
    expect(expectedCall(call(ownerOnly, both)).status).toBe(403);
  });

  it('lets every signed-in account call an account route', () => {
    expect(expectedCall(call({ type: 'account' }, { signedIn: false })).status).toBe(401);
    expect(expectedCall(call({ type: 'account' })).status).toBe('success');
  });
});

describe('what a call may change', () => {
  const owner = { places: { a: { teamRole: 'owner' as const } } };
  const row = (workspaceId: string, clientId?: string) => ({ workspaceId, clientId });

  it('a team member’s write may change any row of the workspace of the path, and no other', () => {
    const write = call(team, { ...owner, method: 'POST' });

    expect(mayChangeRow(write, row('a'))).toBe(true);
    expect(mayChangeRow(write, row('a', 'c2'))).toBe(true);
    expect(mayChangeRow(write, row('b'))).toBe(false);
    expect(mayChangeRow(write, row('b', 'c1'))).toBe(false);
  });

  it('nothing changes on a read, a refused call or an anonymous call', () => {
    expect(mayChangeRow(call(team, { ...owner, method: 'GET' }), row('a'))).toBe(false);
    expect(mayChangeRow(call(team, { places: {}, method: 'POST' }), row('a'))).toBe(false);
    expect(
      mayChangeRow(call(ownerOnly, { ...owner, method: 'DELETE', signedIn: false }), row('a')),
    ).toBe(false);
  });

  it('a client’s write may change only the rows of that client', () => {
    const write = call(ownRecords, {
      method: 'PUT',
      places: { a: { clientId: 'c1' } },
      record: 'own',
    });

    expect(mayChangeRow(write, row('a', 'c1'))).toBe(true);
    expect(mayChangeRow(write, row('a', 'c2'))).toBe(false);
    expect(mayChangeRow(write, row('a'))).toBe(false);
    expect(mayChangeRow(write, row('b', 'c1'))).toBe(false);
  });

  it('an account route’s write follows the workspaces rule of its access', () => {
    const places = { a: { teamRole: 'owner' as const }, b: { clientId: 'c1' } };
    const write = (workspaces?: 'team' | 'client' | 'any') =>
      call(workspaces ? { type: 'account', workspaces } : { type: 'account' }, {
        method: 'PUT',
        places,
      });

    // Any: all of A (team), and only c1 in B (client).
    expect(mayChangeRow(write(), row('a', 'c9'))).toBe(true);
    expect(mayChangeRow(write(), row('b', 'c1'))).toBe(true);
    expect(mayChangeRow(write(), row('b', 'c2'))).toBe(false);
    expect(mayChangeRow(write(), row('b'))).toBe(false);
    expect(mayChangeRow(write(), row('c'))).toBe(false);
    // Team: B, where the caller is only a client, is out of reach.
    expect(mayChangeRow(write('team'), row('a'))).toBe(true);
    expect(mayChangeRow(write('team'), row('b', 'c1'))).toBe(false);
    // Client: A, where the caller is only on the team, is out of reach.
    expect(mayChangeRow(write('client'), row('a'))).toBe(false);
    expect(mayChangeRow(write('client'), row('b', 'c1'))).toBe(true);
    // A read changes nothing.
    expect(mayChangeRow(call({ type: 'account' }, { places }), row('a'))).toBe(false);
  });
});

describe('what a successful read must show', () => {
  const token = (workspaceId: string, ...clientIds: string[]) => ({
    workspaceId,
    clientIds: new Set(clientIds),
  });
  const seeded: [string, ReturnType<typeof token>][] = [
    ['a-c1', token('a', 'c1')],
    ['a-c2', token('a', 'c2')],
    ['b-c3', token('b', 'c3')],
  ];

  it('a team member’s listing holds every seeded record of the workspace', () => {
    const facts = call(team, { places: { a: { teamRole: 'trainer' } } });

    expect(mustShow(facts, seeded, [])).toEqual(['a-c1', 'a-c2']);
  });

  it('a client’s listing holds its own records only', () => {
    const facts = call(ownRecords, { places: { a: { clientId: 'c1' } } });

    expect(mustShow(facts, seeded, [])).toEqual(['a-c1']);
  });

  it('a route that names a record must hold that record', () => {
    const facts = call(team, { places: { a: { teamRole: 'owner' } }, record: 'other-client' });

    expect(mustShow(facts, seeded, ['a-c2'])).toEqual(['a-c2']);
  });

  it('a write, a refused call and a route with nothing seeded must show nothing', () => {
    const owner = { places: { a: { teamRole: 'owner' as const } } };

    expect(mustShow(call(team, { ...owner, method: 'POST' }), seeded, [])).toEqual([]);
    expect(mustShow(call(team, { places: { a: { clientId: 'c1' } } }), seeded, [])).toEqual([]);
    expect(mustShow(call(team, { places: {} }), seeded, [])).toEqual([]);
    expect(mustShow(call(team, owner), [], [])).toEqual([]);
  });

  it('an account route’s listing holds what the caller may see in each workspace', () => {
    const places = { a: { teamRole: 'owner' as const }, b: { clientId: 'c3' } };

    expect(mustShow(call({ type: 'account' }, { places }), seeded, []).sort()).toEqual([
      'a-c1',
      'a-c2',
      'b-c3',
    ]);
    expect(mustShow(call({ type: 'account', workspaces: 'team' }, { places }), seeded, [])).toEqual(
      ['a-c1', 'a-c2'],
    );
  });
});

describe('what a response may show', () => {
  const token = (workspaceId: string, ...clientIds: string[]) => ({
    workspaceId,
    clientIds: new Set(clientIds),
  });

  it('a team member sees the workspace of the path, nothing else', () => {
    const facts = call(team, { places: { a: { teamRole: 'owner' }, b: { teamRole: 'owner' } } });

    expect(mayShow(facts, 'a-row', token('a', 'c2'))).toBe(true);
    expect(mayShow(facts, 'b-row', token('b'))).toBe(false);
  });

  it('a client sees the workspace id and its own records, not another client’s', () => {
    const facts = call(ownRecords, { places: { a: { clientId: 'c1' } } });

    expect(mayShow(facts, 'a', token('a'))).toBe(true);
    expect(mayShow(facts, 'row-1', token('a', 'c1'))).toBe(true);
    expect(mayShow(facts, 'row-2', token('a', 'c2'))).toBe(false);
    expect(mayShow(facts, 'team-row', token('a'))).toBe(false);
  });

  it('shows the caller itself, wherever its own account is listed', () => {
    const facts = call(
      { type: 'account', workspaces: 'team' },
      {
        places: { a: { clientId: 'c1' } },
        self: ['account-id'],
      },
    );

    expect(mayShow(facts, 'account-id', token('a', 'c1'))).toBe(true);
    expect(mayShow(facts, 'c1-row', token('a', 'c1'))).toBe(false);
  });

  it('a refused call shows nothing', () => {
    const facts = call(team, { places: { a: { clientId: 'c1' } } });

    expect(mayShow(facts, 'a', token('a'))).toBe(false);
  });

  it('an account route shows the workspaces where the caller has the asked relationship', () => {
    const places = { a: { teamRole: 'owner' as const }, b: { clientId: 'c1' } };
    const any = call({ type: 'account' }, { places });
    const teamOnly = call({ type: 'account', workspaces: 'team' }, { places });

    expect(mayShow(any, 'a-row', token('a', 'c9'))).toBe(true);
    expect(mayShow(any, 'b-own', token('b', 'c1'))).toBe(true);
    expect(mayShow(any, 'b-other', token('b', 'c2'))).toBe(false);
    expect(mayShow(teamOnly, 'b-own', token('b', 'c1'))).toBe(false);
    expect(mayShow(any, 'c-row', token('c'))).toBe(false);
  });
});

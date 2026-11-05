import { FIXTURE_INVITATION_VALIDITY_MS } from '@fivvi/database/testing';
import { invitationExpiry } from '@fivvi/domain';
import { describe, expect, it } from 'vitest';

describe('the validity of a seeded or factory-made invitation', () => {
  it('is the one of the domain rule (F011), which the database package cannot import', () => {
    const sentAt = new Date('2026-01-01T00:00:00Z');
    expect(invitationExpiry(sentAt).getTime() - sentAt.getTime()).toBe(
      FIXTURE_INVITATION_VALIDITY_MS,
    );
  });
});

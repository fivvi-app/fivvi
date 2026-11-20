import type { Schemas } from '@fivvi/contract';

/**
 * The signed-in person's own team-member ID among `team` (`GET …/team-members`), found by their
 * email address; `null` when they are not on it. The API gives no "me" on a trainer or a session, so
 * every form that words "Je hebt dan al iets" (PS-07) and the PS-01 default *{name} (ik)* find it
 * here, in one place (#1414 changes it once).
 */
export function myTeamMemberId(
  team: readonly Pick<Schemas['TeamMember'], 'id' | 'email'>[],
  email: string,
): string | null {
  return team.find((member) => member.email.toLowerCase() === email.toLowerCase())?.id ?? null;
}

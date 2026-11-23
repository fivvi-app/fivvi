import {
  findClient,
  listBookedClients,
  type SessionView,
  type WorkspaceScope,
  type WorkspaceView,
} from '@fivvi/database';
import { confirmationLanguage } from '@fivvi/domain';
import type { TrainerChangeMail } from '@fivvi/email/trainer-change-mail';
import type { AfterCommit } from '../access.ts';
import type { ApiDependencies } from '../dependencies.ts';
import { trainerChangeEmailEvent } from './email-event.ts';

// The trainer-change email (EM-13, F023) to the clients of sessions that got another trainer: the
// one function the assignment route (#536) and the removal handover (#537) both call, so a client
// gets the same email whichever way their trainer changed. It queues the sends for after the commit
// (`afterCommit`), so nothing is sent for a request that fails or rolls back, and a send that fails
// does not undo the change. Each client gets one email for each class (or for their private
// sessions) listing their dates, in their language, naming no other participant.

/** A date as the email lists it. */
const mailDate = (date: SessionView): TrainerChangeMail['dates'][number] => ({
  startsAt: date.startsAt,
  endsAt: date.endsAt,
  location: { name: date.location.name, address: date.location.address },
});

export interface TrainerChangeEmails {
  readonly scope: WorkspaceScope;
  readonly afterCommit: AfterCommit;
  readonly dependencies: Pick<ApiDependencies, 'sendTrainerChange'>;
  readonly workspace: Pick<WorkspaceView, 'name' | 'timeZone' | 'defaultLocale' | 'trainerWord'>;
  /** The new trainer: their team-member ID and the account's name. */
  readonly trainer: { readonly id: string; readonly name: string };
  /**
   * The sessions that got the trainer, as they are after the change (the version keys the email),
   * all not started: the caller has dropped the others (`sendsTrainerChangeNotice`).
   */
  readonly dates: readonly SessionView[];
}

/**
 * Queues one email for each client with a booked place on the dates, for each class they are booked
 * on (and one for their private sessions). Returns how many it queued.
 */
export async function queueTrainerChangeEmails(input: TrainerChangeEmails): Promise<number> {
  const { scope, workspace, trainer } = input;
  const changed = input.dates.toSorted((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const places = await listBookedClients(
    scope,
    changed.map((date) => date.id),
  );
  // One email for each client and kind: the private sessions, or one class.
  const groups = new Map<string, { clientId: string; dates: SessionView[] }>();
  for (const place of places) {
    const date = changed.find((candidate) => candidate.id === place.sessionId);
    if (!date) continue;
    const key = `${place.clientId}:${date.type === 'private' ? 'private' : (date.groupClass?.id ?? date.id)}`;
    const group = groups.get(key) ?? { clientId: place.clientId, dates: [] };
    group.dates.push(date);
    groups.set(key, group);
  }
  const trainerName = trainer.name.trim() ? trainer.name : null;
  let queued = 0;
  for (const { clientId, dates } of groups.values()) {
    dates.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const client = await findClient(scope, clientId);
    const [first, ...rest] = dates;
    if (!client || !first) continue;
    queued += 1;
    const mail: TrainerChangeMail = {
      to: { email: client.email, name: client.name },
      locale: confirmationLanguage({
        clientEmailLocale: client.emailLocale,
        workspaceDefault: workspace.defaultLocale,
      }),
      workspaceName: workspace.name,
      timeZone: workspace.timeZone,
      session:
        first.type === 'private'
          ? { kind: 'private' }
          : {
              kind: 'class',
              nameNl: first.groupClass?.nameNl ?? '',
              nameEn: first.groupClass?.nameEn ?? null,
            },
      dates: [mailDate(first), ...rest.map(mailDate)],
      trainerName,
      trainerWord: workspace.trainerWord,
      event: trainerChangeEmailEvent(
        trainer.id,
        client.id,
        dates.map((date) => ({ sessionId: date.id, version: date.version })),
      ),
    };
    input.afterCommit(() => input.dependencies.sendTrainerChange(mail));
  }
  return queued;
}

import { type Locale, messages, type TrainerWord, trainerWordForms } from '@fivvi/i18n';

/**
 * The copy of the trainer web that names the role, with the workspace's word filled in
 * (F068, spec #588), in one language. A new workspace says *trainer*; a spec that changed the
 * word asks for that one. The message texts come from the catalogs, never typed here.
 */
export function wordingOf(locale: Locale, choice: TrainerWord = 'trainer') {
  const copy = messages[locale];
  const forms = trainerWordForms(choice, locale);
  /** Fills the six placeholders of the word, and any other the message has. */
  const fill = (message: string, values: Record<string, string> = {}) =>
    Object.entries({ ...forms, ...values }).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, value),
      message,
    );
  return {
    forms,
    /** The sidebar link to the Trainers page. */
    nav: fill(copy.workspaceNav.trainers),
    /** The title of the Trainers page, its heading and its tab title. */
    title: fill(copy.team.title),
    /** The invite button and the title of its dialog. */
    invite: fill(copy.team.invite.title),
    /** The badge and the role label of a Trainer. */
    badge: fill(copy.team.badge.trainer),
    roleLabel: fill(copy.roles.trainerLabel),
    stepDownTitle: fill(copy.team.stepDownDialog.title),
    stepDownConfirm: fill(copy.team.stepDownDialog.confirm),
    roleChanged: (name: string) => fill(copy.team.roleChanged.trainer, { name }),
    removeBody: (name: string, workspace: string) =>
      fill(copy.team.removeDialog.body, { name, workspace }),
    intro: (inviter: string, workspace: string) =>
      fill(copy.invitation.intro, { inviter, workspace }),
    introAnonymous: (workspace: string) => fill(copy.invitation.introAnonymous, { workspace }),
  };
}

export type Wording = ReturnType<typeof wordingOf>;

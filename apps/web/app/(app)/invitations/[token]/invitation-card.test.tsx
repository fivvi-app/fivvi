import { locales, messages, TRAINER_WORDS, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../test/render';
import { InvitationCard } from './invitation-card';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('../../(signed-in)/sign-out-client', () => ({
  signOut: () => Promise.resolve({ ok: true }),
}));

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F068 the invitation page in %s', (locale) => {
  const copy = messages[locale].invitation;

  describe.each(TRAINER_WORDS)('a workspace that says %s', (choice) => {
    const trainerWord = trainerWordForms(choice, locale);

    it('AC1, AC3: the invitation names the role with the workspace’s word, in the reader’s language', () => {
      const withInviter = render(
        locale,
        <InvitationCard
          token="t"
          initial={{
            kind: 'question',
            workspaceName: "John's Gym",
            inviterName: 'John',
            maskedEmail: 'l***@example.com',
            trainerWord,
          }}
        />,
      );
      const anonymous = render(
        locale,
        <InvitationCard
          token="t"
          initial={{
            kind: 'question',
            workspaceName: "John's Gym",
            inviterName: null,
            maskedEmail: 'l***@example.com',
            trainerWord,
          }}
        />,
      );

      expect(withInviter).toContain(
        escapeHtml(
          copy.intro
            .replace('{inviter}', 'John')
            .replace('{aWord}', trainerWord.aWord)
            .replace('{workspace}', "John's Gym"),
        ),
      );
      expect(anonymous).toContain(
        escapeHtml(
          copy.introAnonymous
            .replace('{aWord}', trainerWord.aWord)
            .replace('{workspace}', "John's Gym"),
        ),
      );
    });
  });
});

import { locales, messages, TRAINER_WORDS, trainerWordForms } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { escapeHtml, render } from '../../../../../../../test/render';
import { WordChoice, type WordOption } from './word-choice';

// The card refreshes the page through the router, which exists only in a running app.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

describe.each(locales)('F068 TW-08 Woordkeuze in %s', (locale) => {
  const copy = messages[locale].settingsWording;
  const options: WordOption[] = TRAINER_WORDS.map((value) => {
    const { Word, words } = trainerWordForms(value, locale);
    return { value, word: Word, words };
  });
  const card = (current: (typeof TRAINER_WORDS)[number]) =>
    render(
      locale,
      <WordChoice
        workspaceId="w1"
        workspaceName="John's Gym"
        current={current}
        options={options}
      />,
    );

  it('AC1: a card titled Woordkeuze/Wording shows the four choices, each with its singular and its plural in the reader’s language', () => {
    const html = card('trainer');

    expect(html).toMatch(/data-slot="card"/);
    expect(html).toMatch(new RegExp(`<h2[^>]*>${escapeHtml(copy.title)}</h2>`));
    expect(html.match(/<input[^>]*type="radio"/g)).toHaveLength(4);
    for (const { value, word, words } of options) {
      expect(html).toMatch(
        new RegExp(
          `<label[^>]*><input[^>]*value="${value}"[^>]*/?>.*?<b[^>]*>${escapeHtml(word)}</b><span[^>]*>${escapeHtml(words)}</span></label>`,
        ),
      );
    }
    // The card has no Save of its own: a choice is saved as it is made (the prototype).
    expect(html).not.toContain('type="submit"');
  });

  it('AC1: the words are the ticket’s, in Dutch and in English', () => {
    const html = card('trainer');
    const expected =
      locale === 'en'
        ? [
            'Trainer',
            'trainers',
            'Instructor',
            'instructors',
            'Teacher',
            'teachers',
            'Coach',
            'coaches',
          ]
        : [
            'Trainer',
            'trainers',
            'Instructeur',
            'instructeurs',
            'Docent',
            'docenten',
            'Coach',
            'coaches',
          ];
    for (const text of expected) expect(html).toContain(`>${text}</`);
  });

  it('AC1: the text names the workspace', () => {
    const html = card('trainer');

    expect(html).toContain(escapeHtml(copy.help.replace('{workspace}', "John's Gym")));
  });

  it.each(TRAINER_WORDS)('AC1: the current choice %s is the one checked', (current) => {
    const html = card(current);

    const checked = html.match(/<input[^>]*checked=""[^>]*>/g) ?? [];
    expect(checked).toHaveLength(1);
    expect(checked[0]).toContain(`value="${current}"`);
  });
});

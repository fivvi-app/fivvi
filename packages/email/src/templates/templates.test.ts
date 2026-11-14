import { type Locale, locales, messages, TRAINER_WORDS } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { templates } from '../catalog.ts';
import { createEmailContext, type EmailTemplate, renderEmail } from '../render.tsx';
import { helloEmail } from './hello.tsx';
import { privateSessionEmail } from './private-session.tsx';
import { privateSessionMovedEmail } from './private-session-moved.tsx';
import { trainerInvitationEmail } from './trainer-invitation.tsx';

const all = templates as readonly EmailTemplate<unknown>[];

/** Every `email.*` message of a locale that the hello template shows, as dot-path keys. */
function emailMessages(locale: Locale): Map<string, string> {
  const flat = new Map<string, string>();
  const visit = (node: unknown, key: string) => {
    if (typeof node === 'string') flat.set(key, node);
    else for (const [k, v] of Object.entries(node as object)) visit(v, `${key}.${k}`);
  };
  visit(messages[locale].email, 'email');
  return flat;
}

describe('E006 every template renders in every locale', () => {
  const cases = all.flatMap((template) => locales.map((locale) => [template.id, locale] as const));

  it.each(cases)('%s in %s: no missing keys or unformatted placeholders', async (id, locale) => {
    const template = all.find((t) => t.id === id) as EmailTemplate<unknown>;
    // The translator throws on a missing key or value, so rendering at all proves most of it.
    const email = await renderEmail(template, template.previewProps, { locale });
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toMatch(/\bemail\.[a-z]+\.[a-zA-Z]+/);
      expect(part).not.toMatch(/\{[a-zA-Z]+\}/);
    }
    expect(email.subject.trim()).not.toBe('');
    expect(email.text.trim()).not.toBe('');
    expect(email.html).toContain(`<html dir="ltr" lang="${createEmailContext({ locale }).lang}"`);
  });

  it('the translator fails on a key that is not in the catalog', () => {
    const { t } = createEmailContext({ locale: 'nl-NL' });
    expect(() => t('email.hello.doesNotExist' as never)).toThrow();
  });

  it('the translator fails when a placeholder value is missing', () => {
    const { t } = createEmailContext({ locale: 'en' });
    expect(() => t('email.hello.greeting')).toThrow();
  });
});

describe('E006 hello template', () => {
  // 22:30 UTC on 29 September is 00:30 on 30 September in Amsterdam (CEST, UTC+2).
  const sentAt = new Date('2026-09-29T22:30:00Z');

  const expected = {
    'nl-NL': { lang: 'nl-NL', date: 'woensdag 30 september 2026', time: '00:30' },
    en: { lang: 'en-GB', date: 'Wednesday, 30 September 2026', time: '00:30' },
  } as const;

  it.each(locales)('%s: subject, preview and body come from the catalog', async (locale) => {
    const copy = messages[locale].email;
    const email = await renderEmail(helloEmail, { firstName: 'Anna', sentAt }, { locale });

    expect(email.subject).toBe(copy.hello.subject);
    expect(email.html).toContain(`<title>${copy.hello.subject}</title>`);
    expect(email.html).toContain(copy.hello.preview);
    // The preview line is hidden in the HTML and left out of the text version.
    expect(email.text.startsWith(copy.hello.greeting.replace('{firstName}', 'Anna'))).toBe(true);
    expect(email.text).toContain(copy.hello.body);
    expect(email.text).toContain(copy.layout.footer);
  });

  it.each(locales)(
    '%s: the send time is in Europe/Amsterdam, in the locale format',
    async (locale) => {
      const { date, time, lang } = expected[locale];
      const sentAtLine = messages[locale].email.hello.sentAt
        .replace('{date}', date)
        .replace('{time}', time);
      const email = await renderEmail(helloEmail, { sentAt }, { locale });

      expect(email.text).toContain(sentAtLine);
      expect(email.html).toContain(sentAtLine);
      expect(email.html).toContain(`<body lang="${lang}"`);
    },
  );

  it.each(locales)('%s: winter time is UTC+1', async (locale) => {
    const email = await renderEmail(
      helloEmail,
      { sentAt: new Date('2026-12-01T17:00:00Z') },
      { locale },
    );
    expect(email.text).toContain('18:00');
  });

  it('uses another time zone when asked', async () => {
    const email = await renderEmail(helloEmail, { sentAt }, { locale: 'en', timeZone: 'UTC' });
    expect(email.text).toContain('Tuesday, 29 September 2026');
    expect(email.text).toContain('22:30');
  });

  it.each(locales)('%s: greets without a name when there is none', async (locale) => {
    const email = await renderEmail(helloEmail, { sentAt }, { locale });
    expect(email.text).toContain(messages[locale].email.hello.greetingWithoutName);
  });

  it('escapes the name, which is user content', async () => {
    const email = await renderEmail(
      helloEmail,
      { firstName: '<b>Anna</b>', sentAt },
      { locale: 'nl-NL' },
    );
    expect(email.html).not.toContain('<b>Anna</b>');
    expect(email.html).toContain('&lt;b&gt;Anna&lt;/b&gt;');
  });

  it('uses every hello key in both locales', async () => {
    for (const locale of locales) {
      const withName = await renderEmail(helloEmail, { firstName: 'Anna', sentAt }, { locale });
      const withoutName = await renderEmail(helloEmail, { sentAt }, { locale });
      const html = withName.html + withoutName.html;
      for (const [key, message] of emailMessages(locale)) {
        // Other templates have their own tests (sign-in.test.ts).
        if (!key.startsWith('email.hello.') && !key.startsWith('email.layout.')) continue;
        const fixed = message.split(/\{[a-zA-Z]+\}/)[0] ?? '';
        expect(html, `${locale} ${key}`).toContain(fixed);
      }
    }
  });
});

describe('F068 AC7: the word in each email', () => {
  const invitation = {
    inviterName: 'John',
    workspaceName: 'John’s Gym',
    url: 'https://fivvi.example.com/invitations/test-token',
    expiresAt: new Date('2026-11-12T10:00:00Z'),
  };
  const session = {
    workspaceName: 'John’s Gym',
    startsAt: new Date('2026-09-24T07:00:00Z'),
    endsAt: new Date('2026-09-24T08:00:00Z'),
    locationName: 'John’s Gym',
    locationAddress: null,
    trainerName: 'Sarah',
  };
  const moved = {
    ...session,
    previousStartsAt: new Date('2026-09-23T07:00:00Z'),
    previousEndsAt: new Date('2026-09-23T08:00:00Z'),
  };

  // The expected sentences are spelled out, so a wrong form or article fails here.
  const expected = {
    'nl-NL': {
      trainer: { invitation: 'om een trainer te worden bij', role: 'Trainer: Sarah' },
      instructeur: { invitation: 'om een instructeur te worden bij', role: 'Instructeur: Sarah' },
      docent: { invitation: 'om een docent te worden bij', role: 'Docent: Sarah' },
      coach: { invitation: 'om een coach te worden bij', role: 'Coach: Sarah' },
    },
    en: {
      trainer: { invitation: 'to become a trainer at', role: 'Trainer: Sarah' },
      instructeur: { invitation: 'to become an instructor at', role: 'Instructor: Sarah' },
      docent: { invitation: 'to become a teacher at', role: 'Teacher: Sarah' },
      coach: { invitation: 'to become a coach at', role: 'Coach: Sarah' },
    },
  } as const;

  const cases = locales.flatMap((locale) =>
    TRAINER_WORDS.map((trainerWord) => [locale, trainerWord] as const),
  );

  it.each(cases)(
    '%s, %s: the trainer invitation says the word in its preview and body',
    async (locale, trainerWord) => {
      const { invitation: sentence } = expected[locale][trainerWord];
      const email = await renderEmail(
        trainerInvitationEmail,
        { ...invitation, trainerWord },
        { locale },
      );

      expect(email.text).toContain(sentence);
      expect(email.html).toContain(sentence);
      // The line inbox lists show after the subject.
      expect(
        trainerInvitationEmail.preview(createEmailContext({ locale }), {
          ...invitation,
          trainerWord,
        }),
      ).toContain(sentence);
      // Another word never shows.
      for (const other of TRAINER_WORDS.filter((word) => word !== trainerWord)) {
        expect(email.text).not.toContain(expected[locale][other].invitation);
      }
    },
  );

  it.each(cases)(
    '%s, %s: the private session email names the role with the word',
    async (locale, trainerWord) => {
      const { role } = expected[locale][trainerWord];
      const email = await renderEmail(privateSessionEmail, { ...session, trainerWord }, { locale });

      expect(email.text).toContain(role);
    },
  );

  it.each(cases)(
    '%s, %s: the moved session email names the role with the word',
    async (locale, trainerWord) => {
      const { role } = expected[locale][trainerWord];
      const email = await renderEmail(
        privateSessionMovedEmail,
        { ...moved, trainerWord },
        { locale },
      );

      expect(email.text).toContain(role);
    },
  );

  it.each(locales)(
    '%s: the person’s name in the private session email stays a name',
    async (locale) => {
      const email = await renderEmail(
        privateSessionEmail,
        { ...session, trainerName: 'Coach Karel', trainerWord: 'docent' },
        { locale },
      );

      expect(email.text).toContain(`${locale === 'en' ? 'Teacher' : 'Docent'}: Coach Karel`);
    },
  );
});

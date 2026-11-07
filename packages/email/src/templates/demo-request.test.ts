import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import type { DemoRequestMail } from '../demo-request-mail.ts';
import { renderEmail } from '../render.tsx';
import { demoRequestEmail } from './demo-request.tsx';

const props: DemoRequestMail = {
  name: 'Anna de Vries',
  email: 'anna@example.com',
  businessKind: 'studio',
  trainerCount: 'two-to-four',
  message: 'Ik wil de roosters zien.\nEn de credits.',
  locale: 'en',
};

// The email is for Fivvi's own team, in the owner's language (Dutch), whatever language the
// visitor used; the English catalog entries exist for parity and are rendered here too.
describe('F064 AC5 the demo request email', () => {
  it('has the visitor’s name in the subject, in Dutch', async () => {
    const email = await renderEmail(demoRequestEmail, props, { locale: 'nl-NL' });

    expect(email.subject).toBe('Demo-aanvraag: Anna de Vries');
    expect(email.html).toContain('<title>Demo-aanvraag: Anna de Vries</title>');
  });

  it.each(locales)(
    '%s: shows every answer with its label and links the visitor’s address',
    async (locale) => {
      const copy = messages[locale].email.demoRequest;
      const email = await renderEmail(demoRequestEmail, props, { locale });

      for (const line of [
        copy.nameLabel,
        'Anna de Vries',
        copy.emailLabel,
        'anna@example.com',
        copy.businessLabel,
        copy.business.studio,
        copy.trainersLabel,
        copy.trainers.twoToFour,
        copy.languageLabel,
        copy.languageEn,
        copy.messageLabel,
        'Ik wil de roosters zien.',
        'En de credits.',
        copy.reply,
      ]) {
        expect(email.text).toContain(line);
      }
      expect(email.html).toContain('href="mailto:anna@example.com"');
    },
  );

  it.each(['gym', 'studio', 'personal-trainer'] as const)(
    'names the kind of business %s from the catalog',
    async (businessKind) => {
      const copy = messages['nl-NL'].email.demoRequest.business;
      const label = {
        gym: copy.gym,
        studio: copy.studio,
        'personal-trainer': copy.personalTrainer,
      }[businessKind];

      const email = await renderEmail(
        demoRequestEmail,
        { ...props, businessKind },
        { locale: 'nl-NL' },
      );

      expect(email.text).toContain(label);
    },
  );

  it.each(['one', 'two-to-four', 'five-or-more'] as const)(
    'names the number of trainers %s from the catalog',
    async (trainerCount) => {
      const copy = messages['nl-NL'].email.demoRequest.trainers;
      const label = {
        one: copy.one,
        'two-to-four': copy.twoToFour,
        'five-or-more': copy.fiveOrMore,
      }[trainerCount];

      const email = await renderEmail(
        demoRequestEmail,
        { ...props, trainerCount },
        { locale: 'nl-NL' },
      );

      expect(email.text).toContain(label);
    },
  );

  it('names the language of the visitor’s page, so the answer is in it', async () => {
    const copy = messages['nl-NL'].email.demoRequest;

    const dutch = await renderEmail(
      demoRequestEmail,
      { ...props, locale: 'nl-NL' as const },
      { locale: 'nl-NL' },
    );
    const english = await renderEmail(demoRequestEmail, props, { locale: 'nl-NL' });

    expect(dutch.text).toContain(copy.languageNl);
    expect(english.text).toContain(copy.languageEn);
  });

  it('leaves the message out when there is none', async () => {
    const email = await renderEmail(
      demoRequestEmail,
      { ...props, message: null },
      { locale: 'nl-NL' },
    );

    expect(email.text).not.toContain(messages['nl-NL'].email.demoRequest.messageLabel);
  });

  it('shows markup in the visitor’s words as text, never as HTML', async () => {
    const email = await renderEmail(
      demoRequestEmail,
      { ...props, name: '<b>Anna</b>', message: '<script>alert(1)</script>' },
      { locale: 'nl-NL' },
    );

    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<b>Anna</b>');
    expect(email.html).toContain('&lt;script&gt;');
  });
});

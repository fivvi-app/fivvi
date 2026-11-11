import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EmailLanguage, Locale } from '@fivvi/i18n';
import {
  resolveClientCommunicationLanguage,
  resolveCommunicationLanguage,
  resolveInternalCommunicationLanguage,
  resolveSignInCommunicationLanguage,
} from '@fivvi/i18n';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { createMemoryTransport } from './memory.ts';
import type { PrivateSessionMail } from './private-session-mail.ts';
import { createSendEmail, type SendEmailOptions } from './send.ts';
import { helloEmail } from './templates/hello.tsx';
import type { TrainerInvitationMail } from './trainer-invitation-mail.ts';

// F049 AC4: the send function takes a language only as a resolver of @fivvi/i18n returns it.
const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

describe('F049: the send function only accepts a language a resolver returned', () => {
  it('does not type-check a plain locale, for the send function or the mails built for it', () => {
    // Never called: this is checked by `tsc`, and `@ts-expect-error` fails it when the line is fine.
    const checkedByTypeScript = (send: ReturnType<typeof createSendEmail>) => {
      const base = {
        template: helloEmail,
        props: { sentAt: new Date() },
        to: { email: 'a@example.com' },
      };
      // @ts-expect-error a literal locale is not an EmailLanguage
      void send({ ...base, locale: 'en' });
      // @ts-expect-error a literal locale is not an EmailLanguage
      void send({ ...base, locale: 'nl-NL' });
      // @ts-expect-error a plain Locale is not an EmailLanguage either
      void send({ ...base, locale: 'en' as Locale });
    };
    expect(checkedByTypeScript).toBeTypeOf('function');
    expectTypeOf<PrivateSessionMail['locale']>().toEqualTypeOf<EmailLanguage>();
    expectTypeOf<TrainerInvitationMail['locale']>().toEqualTypeOf<EmailLanguage>();
    expectTypeOf<SendEmailOptions<unknown>['locale']>().toEqualTypeOf<EmailLanguage>();
  });

  it('accepts what every email resolver returns', () => {
    expectTypeOf(
      resolveCommunicationLanguage({ workspaceDefault: 'en' }),
    ).toEqualTypeOf<EmailLanguage>();
    expectTypeOf(
      resolveClientCommunicationLanguage({ workspaceDefault: 'en' }),
    ).toEqualTypeOf<EmailLanguage>();
    expectTypeOf(resolveSignInCommunicationLanguage({ page: {} })).toEqualTypeOf<EmailLanguage>();
    expectTypeOf(resolveInternalCommunicationLanguage()).toEqualTypeOf<EmailLanguage>();
  });

  it('AC4 (EN): Mark Jansen, whose account prefers English, gets a client email in English', async () => {
    const transport = createMemoryTransport();
    const sendEmail = createSendEmail({ transport, sender: { email: 'hi@example.com' } });
    const locale = resolveClientCommunicationLanguage({
      accountPreference: 'en',
      workspaceDefault: 'nl-NL', // John's Gym
    });

    await sendEmail({
      template: helloEmail,
      props: { firstName: 'Mark', sentAt: new Date() },
      to: { email: 'mark@example.com', name: 'Mark Jansen' },
      locale,
    });

    expect(transport.sent[0]).toMatchObject({ locale: 'en', to: { email: 'mark@example.com' } });
  });

  it('AC4 (NL): Anna de Vries, with no language of her own, gets a client email in Dutch', async () => {
    const transport = createMemoryTransport();
    const sendEmail = createSendEmail({ transport, sender: { email: 'hi@example.com' } });
    const locale = resolveClientCommunicationLanguage({
      accountPreference: null,
      clientLanguage: null,
      workspaceDefault: 'nl-NL',
    });

    await sendEmail({
      template: helloEmail,
      props: { firstName: 'Anna', sentAt: new Date() },
      to: { email: 'anna@example.com', name: 'Anna de Vries' },
      locale,
    });

    expect(transport.sent[0]).toMatchObject({ locale: 'nl-NL', to: { email: 'anna@example.com' } });
  });
});

const skipped = new Set(['node_modules', '.next', '.turbo', 'dist', 'generated', 'e2e', 'test']);
const isTest = (file: string) => /\.(test|spec)\.tsx?$/.test(file);

async function sourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipped.has(entry.name)) files.push(...(await sourceFiles(full)));
    } else if (/\.tsx?$/.test(entry.name) && !isTest(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe('F049: nothing makes an EmailLanguage by hand', () => {
  it('casts to EmailLanguage only inside the resolvers, never elsewhere outside tests', async () => {
    const files = [
      ...(await sourceFiles(path.join(repositoryRoot, 'apps'))),
      ...(await sourceFiles(path.join(repositoryRoot, 'packages'))),
    ];
    const cast = /\bas\s+(?:unknown\s+as\s+)?EmailLanguage\b/;
    const casting: string[] = [];
    for (const file of files) {
      if (cast.test(await readFile(file, 'utf8')))
        casting.push(path.relative(repositoryRoot, file));
    }
    // The scan finds the one place that casts (so it is not looking at nothing), and only it.
    expect(casting).toEqual(['packages/i18n/src/locale.ts']);
  });
});

import { type Locale, locales, messages } from '@fivvi/i18n';
import { Text } from 'react-email';
import { describe, expect, it } from 'vitest';
import { catalog } from '../catalog.ts';
import { type EmailTemplate, renderEmail } from '../render.tsx';
import { signInEmail } from '../templates/sign-in.tsx';

// F049 (#713): the client and team frames. Test templates stand in for a feature's email, so the
// frame is tested apart from any one template.
interface Props {
  workspaceName: string;
}

const body: Pick<
  EmailTemplate<Props>,
  'subject' | 'preview' | 'render' | 'previewProps' | 'userContent'
> = {
  subject: () => 'Onderwerp',
  preview: () => 'Voorbeeld',
  render: (ctx) => <Text>{ctx.t('email.hello.body')}</Text>,
  userContent: ['workspaceName'],
  previewProps: { workspaceName: "John's Gym" },
};

const clientEmail: EmailTemplate<Props> = {
  ...body,
  id: 'frame-client-test',
  frame: { kind: 'client', workspaceName: (props) => props.workspaceName },
};
const teamEmail: EmailTemplate<Props> = {
  ...body,
  id: 'frame-team-test',
  frame: { kind: 'team', workspaceName: (props) => props.workspaceName },
};

const reason = {
  client: {
    'nl-NL': "Je krijgt deze e-mail omdat je klant bent bij John's Gym.",
    en: "You're getting this email because you're a client of John's Gym.",
  },
  team: {
    'nl-NL': "Je krijgt deze e-mail omdat je in het team van John's Gym zit.",
    en: "You're getting this email because you're on the team at John's Gym.",
  },
} as const;
const questions = {
  'nl-NL': "Vragen? Neem contact op met John's Gym.",
  en: "Questions? Contact John's Gym.",
} as const;
const buttonLabel = { 'nl-NL': 'In Fivvi bekijken', en: 'View in Fivvi' } as const;
const sentWith = { 'nl-NL': 'Verstuurd via Fivvi', en: 'Sent with Fivvi' } as const;
const props = { workspaceName: "John's Gym" };

describe('AC3: client and team frames, sign-in without frame', () => {
  describe('the client frame', () => {
    it.each(locales)(
      '%s: workspace at the top, one button to fivvi.app, the footer',
      async (locale) => {
        const email = await renderEmail(clientEmail, props, { locale });
        const copy = messages[locale].email.frame;

        expect(email.text.startsWith("John's Gym")).toBe(true);
        expect(email.text).toContain(reason.client[locale]);
        expect(email.text).toContain(questions[locale]);
        expect(email.text).toContain(sentWith[locale]);
        // Order: header, content, button, footer, "sent with".
        const at = (text: string) => email.text.indexOf(text);
        expect(at("John's Gym")).toBeLessThan(at(copy.button));
        expect(at(copy.button)).toBeLessThan(at(reason.client[locale]));
        expect(at(reason.client[locale])).toBeLessThan(at(questions[locale]));
        expect(at(questions[locale])).toBeLessThan(at(sentWith[locale]));

        const hrefs = [...email.html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((match) => match[1]);
        expect(hrefs).toHaveLength(1);
        expect(hrefs[0]).toBe('https://fivvi.app/home');
        expect(email.html).toContain(copy.button);
        expect(copy.button).toBe(buttonLabel[locale]);
        expect(email.html).toContain('John&#x27;s Gym');
      },
    );

    it('a button path stays on fivvi.app', async () => {
      const withPath: EmailTemplate<Props> = {
        ...clientEmail,
        frame: {
          kind: 'client',
          workspaceName: (p) => p.workspaceName,
          buttonPath: () => 'bookings',
        },
      };
      const email = await renderEmail(withPath, props, { locale: 'en' });
      expect(email.html).toContain('href="https://fivvi.app/bookings"');
    });

    it.each([
      '//evil.example.com',
      'https://example.com',
      'https://example.com/home',
      '\\\\evil.example.com',
    ])('a button path cannot leave fivvi.app: %s', async (path) => {
      const escaping: EmailTemplate<Props> = {
        ...clientEmail,
        frame: { kind: 'client', workspaceName: (p) => p.workspaceName, buttonPath: () => path },
      };
      await expect(renderEmail(escaping, props, { locale: 'en' })).rejects.toThrow(/fivvi\.app/);
    });

    it.each(locales)('%s: names the language of the page', async (locale) => {
      const email = await renderEmail(clientEmail, props, { locale });
      expect(email.html).toContain(`lang="${locale === 'nl-NL' ? 'nl-NL' : 'en-GB'}"`);
    });
  });

  describe('the team frame', () => {
    it.each(locales)('%s: the team footer, not the client footer', async (locale) => {
      const email = await renderEmail(teamEmail, props, { locale });

      expect(email.text.startsWith("John's Gym")).toBe(true);
      expect(email.text).toContain(reason.team[locale]);
      expect(email.text).not.toContain(reason.client[locale]);
      expect(email.text).toContain(sentWith[locale]);
      expect(email.html).toContain('href="https://fivvi.app/home"');
    });
  });

  describe('the sign-in email', () => {
    it.each(locales)('%s: no workspace header and neither footer', async (locale) => {
      const email = await renderEmail(signInEmail, signInEmail.previewProps, { locale });
      const copy = messages[locale].email;

      expect(email.text).not.toContain(copy.frame.clientReason.split('{workspace}')[0] as string);
      expect(email.text).not.toContain(copy.frame.teamReason.split('{workspace}')[0] as string);
      expect(email.text).not.toContain(sentWith[locale]);
      expect(email.text).toContain(copy.layout.footer);
    });
  });
});

describe('F049 the frame shows the workspace name as typed', () => {
  it.each(locales)('%s: <b> and & in the header and the footer', async (locale: Locale) => {
    const name = 'Fit <b>& Co';
    for (const template of [clientEmail, teamEmail]) {
      const email = await renderEmail(template, { workspaceName: name }, { locale });
      // Escaped in the HTML, as typed in the text part; never as markup.
      expect(email.html).not.toContain('<b>');
      expect(email.html.split('Fit &lt;b&gt;&amp; Co').length - 1).toBeGreaterThanOrEqual(3);
      expect(email.text.split(name).length - 1).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('F049 which catalog emails use a frame', () => {
  it.each(locales)('%s: EM-04 and EM-11 are in the client frame', async (locale) => {
    for (const id of ['EM-04', 'EM-11']) {
      const entry = catalog.find((e) => e.id === id);
      if (entry?.status !== 'active') throw new Error(`${id} should be active`);
      const email = await renderEmail(entry.template, entry.template.previewProps, { locale });
      const workspace = (entry.template.previewProps as Props).workspaceName;
      expect(email.text.startsWith(workspace), `${id} ${locale}`).toBe(true);
      expect(email.text).toContain(
        messages[locale].email.frame.clientReason.replace('{workspace}', workspace),
      );
    }
  });

  it('EM-09, the trainer invitation, keeps its layout', async () => {
    const entry = catalog.find((e) => e.id === 'EM-09');
    if (entry?.status !== 'active') throw new Error('EM-09 should be active');
    const email = await renderEmail(entry.template, entry.template.previewProps, { locale: 'en' });
    expect(email.text).toContain(messages.en.email.layout.footer);
    expect(email.text).not.toContain(sentWith.en);
  });
});

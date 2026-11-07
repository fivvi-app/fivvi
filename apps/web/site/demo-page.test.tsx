import { locales, messages } from '@fivvi/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../test/render';
import { DemoPage } from './demo-page';
import { builtPages } from './routes';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

// Expected copy is read from the catalogs, never hard-coded (TESTING.md §5.4).
describe.each(locales)('F064 the demo page in %s', (locale) => {
  const copy = messages[locale].site;

  it('has its whole text in the HTML: one h1, the lead, the status line and the three steps', () => {
    const page = html(<DemoPage locale={locale} />);

    expect(page.match(/<h1[ >]/g)).toHaveLength(1);
    expect(page).toContain(escapeHtml(copy.demo.headline));
    expect(page).toContain(escapeHtml(copy.demo.lead));
    expect(page).toContain(escapeHtml(copy.home.status));
    for (const step of Object.values(copy.demo.steps)) {
      expect(page).toContain(escapeHtml(step.title));
      expect(page).toContain(escapeHtml(step.body));
    }
    expect(page).not.toContain('<script');
    expect(page).not.toContain('{{');
  });

  it('AC5: the form asks for the name, the email address, the kind of business, the number of trainers and an optional message', () => {
    const page = html(<DemoPage locale={locale} />);
    const form = copy.demo.form;

    expect(page).toContain(`<form`);
    for (const label of [form.name, form.email, form.business, form.trainers, form.message]) {
      expect(page).toMatch(new RegExp(`<label[^>]*>${escapeRegExp(escapeHtml(label))}</label>`));
    }
    for (const name of ['name', 'email', 'businessKind', 'trainerCount', 'message']) {
      expect(page).toContain(`name="${name}"`);
    }
    for (const option of [
      form.businessGym,
      form.businessStudio,
      form.businessPersonalTrainer,
      form.trainersOne,
      form.trainersTwoToFour,
      form.trainersFiveOrMore,
    ]) {
      expect(page).toContain(`>${escapeHtml(option)}</option>`);
    }
    expect(page).toContain(escapeHtml(form.send));
    expect(page).toContain(escapeHtml(form.note));
    expect(page).toContain('type="email"');
    expect(page).toContain('autoComplete="email"');
  });

  it('AC6: the honeypot is a field people never reach or hear', () => {
    const page = html(<DemoPage locale={locale} />);

    const honeypot = /<div aria-hidden="true"[^>]*><input[^>]*name="website"[^>]*><\/div>/.exec(
      page,
    );
    expect(honeypot?.[0]).toContain('tabindex="-1"');
    expect(honeypot?.[0]).toContain('autoComplete="off"');
    // No label and no text of its own: a person never meets it.
    expect(honeypot?.[0]).not.toContain('<label');
  });

  it('promises no reply time the owner has not confirmed (DECISIONS.md §9, assumption 2)', () => {
    const texts = [copy.demo.form.sent, messages[locale].email.demoRequest.reply];

    for (const text of texts) expect(text).not.toMatch(/1 werkdag|1 working day|one working day/i);
    // The 30 minutes of the demo are still said.
    expect(copy.demo.lead).toMatch(/30/);
  });

  it('shows no error and no confirmation before anything is sent', () => {
    const page = html(<DemoPage locale={locale} />);

    expect(page).not.toContain('role="alert"');
    expect(page).not.toContain('role="status"');
    expect(page).not.toContain('aria-invalid="true"');
    expect(page).not.toContain(escapeHtml(copy.demo.form.sent));
  });

  it('links the privacy policy and the clients page only once they exist, so no link is a 404', () => {
    const en = locale === 'en';
    const none = html(<DemoPage locale={locale} built={['home', 'demo']} />);
    expect(none).not.toContain('<a ');
    expect(none).toContain(escapeHtml(copy.demo.form.client));
    expect(none).not.toContain(escapeHtml(copy.demo.form.privacyLink));

    const all = html(<DemoPage locale={locale} built={[...builtPages, 'privacy', 'clients']} />);
    expect(all).toContain(`href="${en ? '/en/privacy' : '/privacy'}"`);
    expect(all).toContain(`href="${en ? '/en/clients' : '/klanten'}"`);
    expect(all).toContain(escapeHtml(copy.demo.form.privacyLink));
  });
});

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

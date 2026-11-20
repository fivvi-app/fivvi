import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../../../test/render';
import { SignInForm } from './sign-in-form';

// The language switch refreshes through the router of a running app; clicking is in e2e.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

describe.each(locales)('F011 the invitation sign-in (TW-10) in %s', (locale) => {
  const copy = messages[locale].signIn;
  const emailField = (html: string) => /<input[^>]*id="email"[^>]*>/.exec(html)?.[0] ?? '';

  it('AC1: opens with the invited address in the email field, which stays an editable field', () => {
    const html = render(
      locale,
      <SignInForm locale={locale} returnPath="/invitations/abc" defaultEmail="lisa@example.com" />,
    );

    expect(html).toContain(copy.emailLabel);
    expect(emailField(html)).toContain('value="lisa@example.com"');
    expect(emailField(html)).not.toMatch(/\s(readOnly|disabled)[=\s/>]/);
  });

  it('opens empty without an invited address', () => {
    const html = render(locale, <SignInForm locale={locale} />);

    expect(emailField(html)).toContain('id="email"');
    expect(emailField(html)).toContain('value=""');
  });
});

import '@fivvi/ui/globals.css';
import { messages } from '@fivvi/i18n';
import type { Metadata } from 'next';

// Next.js renders this for an address that matches no page, without any layout: the app and the
// public website have one root layout each (ADR-030), so there is none to show it in. Nothing here
// asks the request for a language, so it says the same in both, each in its own `lang`.
export const metadata: Metadata = {
  title: `${messages['nl-NL'].notFound.title} / ${messages.en.notFound.title}`,
};

export default function GlobalNotFound() {
  return (
    <html lang="nl-NL">
      <body data-density="touch">
        <main className="mx-auto grid max-w-xl gap-6 p-6">
          <section lang="nl-NL">
            <h1 className="text-2xl font-semibold">{messages['nl-NL'].notFound.title}</h1>
            <p className="mt-2 text-muted-foreground">{messages['nl-NL'].notFound.body}</p>
          </section>
          <section lang="en">
            <h2 className="text-2xl font-semibold">{messages.en.notFound.title}</h2>
            <p className="mt-2 text-muted-foreground">{messages.en.notFound.body}</p>
          </section>
        </main>
      </body>
    </html>
  );
}

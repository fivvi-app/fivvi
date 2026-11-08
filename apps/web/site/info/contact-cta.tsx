import type { Locale } from '@fivvi/i18n';
import { PillButton } from '@fivvi/ui/kit/pill-button';
import Link from 'next/link';
import { type SitePage, sitePagePath } from '../routes';

/**
 * The call to action at the foot of a page: book a demo, and see pricing (not on the pricing page
 * itself). A link to a page that does not exist yet is left out (`built`), and with no demo page
 * there is no call to action at all.
 */
export function ContactCta({
  locale,
  built,
  copy,
}: {
  locale: Locale;
  built: readonly SitePage[];
  copy: { heading: string; text: string; demo: string; pricing?: string };
}) {
  if (!built.includes('demo')) return null;
  return (
    <section className="mt-[clamp(56px,8vw,104px)] grid items-center gap-5 rounded-[calc(var(--radius-card)*1.3)] bg-card p-[clamp(28px,5vw,64px)] md:grid-cols-[3fr_2fr] md:gap-14">
      <div>
        <h2 className="text-[clamp(30px,4.2vw,50px)] leading-[1.05] font-bold tracking-[-0.028em] text-balance">
          {copy.heading}
        </h2>
        <p className="mt-3 text-muted-foreground text-pretty">{copy.text}</p>
      </div>
      <div className="grid gap-2.5">
        <PillButton asChild>
          <Link href={sitePagePath('demo', locale)}>{copy.demo}</Link>
        </PillButton>
        {copy.pricing && built.includes('pricing') ? (
          <PillButton asChild variant="tonal">
            <Link href={sitePagePath('pricing', locale)}>{copy.pricing}</Link>
          </PillButton>
        ) : null}
      </div>
    </section>
  );
}

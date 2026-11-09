import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { InfoPage, PageHead } from '../info/page-head';
import { pageCopy, pageSeo } from '../seo';
import { siteText } from '../text';
import { type LegalDocument, legalHtml } from './legal-text';

/** The title and description of a legal page in a language (unique per page, AC12). */
export function legalMetadata(document: LegalDocument, locale: Locale): Metadata {
  return pageSeo(document, locale, pageCopy(document, locale));
}

/**
 * The text as the website's design sets it (`docs/design/website/site.css`, `.legal`): a readable
 * column, with the Markdown's own elements styled from here, as the text has no classes.
 */
const legalText = [
  'mt-8 max-w-[46em] text-base leading-[1.55] [overflow-wrap:anywhere]',
  '[&_h2]:mt-9 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:font-bold [&_h2]:tracking-[-0.015em]',
  '[&_h3]:mt-6 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold',
  '[&_p]:my-2.5 [&_li]:my-1',
  '[&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5.5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5.5',
  '[&_[role=region]]:my-3.5 [&_[role=region]]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm',
  '[&_td]:border-b [&_td]:border-border [&_td]:px-2.5 [&_td]:py-2 [&_td]:text-left [&_td]:align-top',
  '[&_th]:border-b [&_th]:border-border [&_th]:px-2.5 [&_th]:py-2 [&_th]:text-left [&_th]:align-top',
  '[&_a]:text-accent-text [&_a]:underline [&_hr]:my-6 [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border',
].join(' ');

/**
 * The privacy policy and the terms (F064, AC10): the text of `docs/legal` for the language, rendered
 * to HTML when the site is built. The page head carries the title, so the text's own title is left
 * out. An open `{{…}}` value or a draft notice in the text fails the build (`legal-text.ts`).
 */
export function LegalPage({ document, locale }: { document: LegalDocument; locale: Locale }) {
  const t = siteText(locale);
  return (
    <InfoPage>
      <PageHead headline={t(`site.${document}.headline`)} status={t('site.home.status')} />
      {/* The text is the repository's own Markdown, rendered by `legal-text.ts`; no visitor input. */}
      <div
        className={legalText}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time HTML of the repository's own legal texts, which refuses raw HTML
        dangerouslySetInnerHTML={{ __html: legalHtml(document, locale) }}
      />
    </InfoPage>
  );
}

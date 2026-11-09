import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Locale } from '@fivvi/i18n';
import { Marked, Renderer, type Tokens } from 'marked';
import { sitePagePath } from '../routes';
import { siteText } from '../text';

/** The legal texts that have a page of their own (F064, AC10). The sub-processors page is built from the catalog. */
export const legalDocuments = ['privacy', 'terms'] as const;
export type LegalDocument = (typeof legalDocuments)[number];

/** The file of a text in `docs/legal`: one per language (`privacy-policy.nl.md`, `terms.en.md`). */
export function legalFile(document: LegalDocument, locale: Locale): string {
  const language = locale === 'en' ? 'en' : 'nl';
  return `${document === 'privacy' ? 'privacy-policy' : 'terms'}.${language}.md`;
}

/**
 * `docs/legal` from `apps/web`, where `next build` and the tests run. The texts are read when the
 * page is built (ADR-030), so the production image needs them in its build context
 * (`.dockerignore`), not at run time.
 */
const legalDirectory = path.resolve(process.cwd(), '../../docs/legal');

/**
 * Fails the build when a text is not finished (AC10): an open `{{…}}` value, or a draft notice (the
 * `> **⚠️ …**` blockquote or its words, as `docs/legal/README.md` describes them). The error names
 * the file and what it found, so whoever breaks the build knows what to finish.
 */
export function checkLegalText(markdown: string, file: string): void {
  const open = markdown.match(/\{\{[^}]*\}\}/);
  if (open) {
    throw new Error(`${file} still has an open value, ${open[0]}; fill it in before publishing`);
  }
  if (/^[ \t]*>[ \t]*\**[ \t]*⚠️|NOT LEGAL ADVICE|GEEN JURIDISCH ADVIES/im.test(markdown)) {
    throw new Error(`${file} still has a draft notice; take it out before publishing`);
  }
}

/** What a relative link of a legal text may point to: another text of `docs/legal` with a page. */
function pageOfFile(
  href: string,
): { page: 'privacy' | 'terms' | 'subProcessors'; locale?: Locale } | undefined {
  const match = /^(privacy-policy|terms|sub-processors)(?:\.(nl|en))?\.md$/.exec(href);
  if (!match) return undefined;
  const page = (
    { 'privacy-policy': 'privacy', terms: 'terms', 'sub-processors': 'subProcessors' } as const
  )[match[1] as 'privacy-policy' | 'terms' | 'sub-processors'];
  const language = match[2];
  return {
    page,
    ...(language ? { locale: language === 'en' ? ('en' as const) : ('nl-NL' as const) } : {}),
  };
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * The HTML of a legal text for a page in `locale`: the file's own words, with the title left out (the
 * page head has it). Relative links to other files of `docs/legal` become the site's own pages (the
 * language is the file's when its name says one, the page's otherwise), a link whose text is only
 * the file name says the name of the page instead, and any other relative link fails the build, so
 * no link is a 404. Raw HTML in a text fails the build too.
 */
export function renderLegalText(markdown: string, locale: Locale, file: string): string {
  checkLegalText(markdown, file);
  let heading = '';
  const marked = new Marked({
    renderer: {
      heading({ text }: Tokens.Heading) {
        heading = text;
        return false;
      },
      // A table scrolls sideways on a phone, so it is a region with a name (the heading above it) that
      // a keyboard can focus (axe: scrollable-region-focusable).
      table(this: Renderer, token: Tokens.Table) {
        if (!heading) throw new Error(`${file} has a table before its first heading`);
        return `<div role="region" aria-label="${escapeHtml(heading)}" tabindex="0">${Renderer.prototype.table.call(this, token)}</div>\n`;
      },
      html({ raw }: Tokens.HTML | Tokens.Tag) {
        throw new Error(`${file} has raw HTML (${raw.trim().slice(0, 40)}); use Markdown`);
      },
      link(this, { href, title, tokens }: Tokens.Link) {
        const inside = this.parser.parseInline(tokens);
        const open = (target: string, extra = '') =>
          `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ''}${extra}>`;
        if (/^(https?:\/\/|mailto:)/.test(href)) return `${open(href)}${inside}</a>`;
        const target = pageOfFile(href);
        if (!target) {
          throw new Error(
            `${file} links to ${href}, which is not a page of the website; link a page or write plain text`,
          );
        }
        const to = target.locale ?? locale;
        const onlyTheFileName =
          tokens.length === 1 && tokens[0]?.type === 'codespan' && tokens[0].text === href;
        const label = onlyTheFileName
          ? escapeHtml(siteText(to)(`site.${target.page}.headline`))
          : inside;
        const language =
          to === locale
            ? ''
            : ` hreflang="${to === 'en' ? 'en' : 'nl'}" lang="${to === 'en' ? 'en' : 'nl'}"`;
        return `${open(sitePagePath(target.page, to), language)}${label}</a>`;
      },
    },
  });
  const tokens = marked
    .lexer(markdown)
    .filter((token) => !(token.type === 'heading' && token.depth === 1));
  return marked.parser(tokens);
}

/** The HTML of a legal text of `docs/legal` in a language, read and checked when the page is built. */
export function legalHtml(document: LegalDocument, locale: Locale): string {
  const file = legalFile(document, locale);
  return renderLegalText(readFileSync(path.join(legalDirectory, file), 'utf8'), locale, file);
}

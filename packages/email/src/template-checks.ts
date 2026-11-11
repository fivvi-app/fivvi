import { type Locale, locales, messages } from '@fivvi/i18n';
import {
  type EmailMessageKey,
  type EmailTemplate,
  type RenderedEmail,
  renderEmail,
  type UserContentProp,
} from './render.tsx';

/**
 * The checks every catalog email must pass (F049, spec #476: AC2, AC5, AC6, AC7). Each check
 * renders a template with its own `previewProps` (synthetic data) in both languages and returns
 * what is wrong, one sentence per problem, empty when it is sound. `catalog.test.ts` runs them on
 * every active entry, so a new template is checked without a change to the suite;
 * `template-checks.test.tsx` proves that each check fails for a template that breaks its rule.
 */

/** The longest subject a mail client shows in full (spec #476, AC2). */
export const maxSubjectLength = 78;

// -- AC2: both languages, from catalog keys only ---------------------------------------------

/** The placeholders of an ICU message, sorted, including those inside a plural or select. */
export function messageArguments(message: string): string[] {
  const found = new Set<string>();
  const visit = (text: string) => {
    for (let at = 0; at < text.length; at++) {
      if (text[at] !== '{') continue;
      const end = closingBrace(text, at);
      const inner = text.slice(at + 1, end);
      const comma = inner.indexOf(',');
      found.add((comma === -1 ? inner : inner.slice(0, comma)).trim());
      if (comma !== -1) {
        // `{count, plural, one {…} other {…}}`: the branches are messages of their own.
        const rest = inner.slice(comma + 1);
        const branches = rest.slice(rest.indexOf(',') + 1);
        for (let branch = 0; branch < branches.length; branch++) {
          if (branches[branch] !== '{') continue;
          const close = closingBrace(branches, branch);
          visit(branches.slice(branch + 1, close));
          branch = close;
        }
      }
      at = end;
    }
  };
  visit(message);
  return [...found].sort();
}

/** The index of the `}` that closes the `{` at `start`, or the end of the text. */
function closingBrace(text: string, start: number): number {
  let depth = 0;
  for (let at = start; at < text.length; at++) {
    if (text[at] === '{') depth++;
    if (text[at] === '}' && --depth === 0) return at;
  }
  return text.length;
}

function messageOf(locale: Locale, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((node, part) => {
    return node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined;
  }, messages[locale]);
  return typeof value === 'string' ? value : undefined;
}

interface Rendering {
  email: RenderedEmail;
  /** The keys the template asked for, in the order it first asked. */
  keys: EmailMessageKey[];
}

async function renderOnce<Props>(
  template: EmailTemplate<Props>,
  props: Props,
  locale: Locale,
): Promise<Rendering> {
  const keys = new Set<EmailMessageKey>();
  const email = await renderEmail(template, props, {
    locale,
    onTranslate: (key) => keys.add(key),
  });
  return { email, keys: [...keys] };
}

/** Renders a template in both languages; a language that throws is a problem, not an exception. */
async function renderBoth<Props>(
  template: EmailTemplate<Props>,
  props: Props,
  problems: string[],
): Promise<Map<Locale, Rendering>> {
  const rendered = new Map<Locale, Rendering>();
  for (const locale of locales) {
    try {
      rendered.set(locale, await renderOnce(template, props, locale));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      problems.push(`${locale}: does not render: ${reason}`);
    }
  }
  return rendered;
}

/**
 * AC2: renders in `nl-NL` and `en` from catalog keys only, both languages use the same keys and
 * placeholders, the subject fits in 78 characters with the sample data, and a plain-text part
 * is produced.
 */
export async function checkRendering<Props>(template: EmailTemplate<Props>): Promise<string[]> {
  const problems: string[] = [];
  const rendered = await renderBoth(template, template.previewProps, problems);

  for (const [locale, { email }] of rendered) {
    const length = [...email.subject].length;
    if (email.subject.trim() === '') problems.push(`${locale}: the subject is empty`);
    else if (length > maxSubjectLength) {
      problems.push(
        `${locale}: the subject is ${length} characters, the limit is ${maxSubjectLength}`,
      );
    }
    if (email.text.trim() === '') problems.push(`${locale}: the plain-text part is empty`);
    else if (/<\/?[a-z][^>]*>/i.test(email.text)) {
      problems.push(`${locale}: the plain-text part holds HTML tags`);
    }
    for (const [part, text] of [
      ['subject', email.subject],
      ['text', email.text],
      ['html', email.html],
    ] as const) {
      if (/\bemail\.[a-z]+\.[a-zA-Z]+/.test(text) || /\{[a-zA-Z]+\}/.test(text)) {
        problems.push(`${locale}: the ${part} holds an unformatted key or placeholder`);
      }
    }
  }

  const keysByLocale = locales.map((locale) => new Set(rendered.get(locale)?.keys ?? []));
  const [first, ...others] = keysByLocale;
  const all = new Set(keysByLocale.flatMap((keys) => [...keys]));
  if (
    rendered.size === locales.length &&
    first &&
    others.some((keys) => keys.size !== first.size || [...keys].some((key) => !first.has(key)))
  ) {
    const odd = [...all].filter((key) => !keysByLocale.every((keys) => keys.has(key)));
    problems.push(`the languages use different keys: ${odd.join(', ')}`);
  }
  for (const key of all) {
    const texts = locales.map((locale) => messageOf(locale, key));
    const missing = locales.filter((_, index) => texts[index] === undefined);
    if (missing.length > 0) {
      problems.push(`${key} is missing in ${missing.join(' and ')}`);
      continue;
    }
    const [one, two] = texts.map((text) => messageArguments(text as string));
    if (one && two && one.join() !== two.join()) {
      problems.push(
        `${key} has other placeholders per language: ${locales[0]} {${one.join(', ')}}, ${locales[1]} {${two.join(', ')}}`,
      );
    }
  }
  return problems;
}

// -- AC5: no tracking, no redirects, links to fivvi.app only ---------------------------------

const allowedHost = 'fivvi.app';

/** Query parameters that name where a link goes next. */
const redirectParameters = new Set([
  'redirect',
  'redirect_uri',
  'redirect_url',
  'redirecturl',
  'url',
  'goto',
  'target',
  'dest',
  'destination',
  'link',
]);
/** Query parameters of click and open tracking. */
const trackingParameter = /^(utm_|mc_(cid|eid)$|fbclid$|gclid$|_hsenc$|_hsmi$|mkt_tok$|trk$|trk_)/i;
/** Path segments of a link shortener, click tracker or open pixel. */
const trackerSegments = new Set([
  'click',
  'track',
  'tracking',
  'trk',
  'redirect',
  'r',
  'l',
  'out',
  'go',
  'pixel',
]);
const looksLikeAddress = /^([a-z][a-z0-9+.-]*:)?\/\//i;

export interface LinkOptions {
  /** Internal emails (the demo request) may link to the visitor's address with `mailto:`. */
  allowMailto: boolean;
}

/**
 * Why a link in an email is not allowed, `undefined` when it is: an absolute `https` address on
 * `fivvi.app` itself, with no tracking parameter, no redirect and no tracker path.
 */
export function checkUrl(raw: string, { allowMailto }: LinkOptions): string | undefined {
  if (/^mailto:/i.test(raw)) {
    return allowMailto ? undefined : `${raw} is a mailto link, which only internal emails may have`;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `${raw} is not an absolute https address (a relative link breaks in a mail client)`;
  }
  if (url.protocol !== 'https:') {
    return url.protocol === 'http:'
      ? `${raw} uses http, not https`
      : `${raw} uses the scheme ${url.protocol}, only https is allowed`;
  }
  if (url.username || url.password) return `${raw} carries credentials`;
  if (url.port) return `${raw} names a port`;
  if (url.hostname !== allowedHost) {
    return `${raw} leads to ${url.hostname}, not to ${allowedHost}`;
  }
  for (const [name, value] of url.searchParams) {
    if (trackingParameter.test(name)) return `${raw} has a tracking parameter (${name})`;
    if (looksLikeAddress.test(value)) {
      return `${raw} is a redirect: ${name} carries another address`;
    }
    if (redirectParameters.has(name.toLowerCase())) {
      return `${raw} has a redirect parameter (${name})`;
    }
  }
  const segment = url.pathname
    .split('/')
    .find((part) => trackerSegments.has(decodeURIComponent(part).toLowerCase()));
  if (segment !== undefined) return `${raw} looks like a tracker (the path has /${segment}/)`;
  return undefined;
}

const decodeEntities = (value: string) =>
  value
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

/** Every address the HTML points at: attributes that load or open something, and CSS `url()`. */
function htmlReferences(html: string): string[] {
  const found: string[] = [];
  const attribute =
    /\s(?:href|src|srcset|action|formaction|poster|background|cite)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  for (const match of html.matchAll(attribute)) {
    const value = decodeEntities(match[1] ?? match[2] ?? '');
    const isSourceSet = /^\s*srcset/i.test(match[0]);
    if (isSourceSet) {
      for (const candidate of value.split(',')) found.push(candidate.trim().split(/\s+/)[0] ?? '');
    } else {
      found.push(value.trim());
    }
  }
  for (const match of decodeEntities(html).matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    found.push((match[2] ?? '').trim());
  }
  return found.filter((value) => value !== '');
}

/** Every address the plain-text part shows with a scheme. */
function textReferences(text: string): string[] {
  const schemes = /\b(?:https?|ftp|mailto|tel|sms|javascript|data):[^\s<>"'\])]*/gi;
  return [...text.matchAll(schemes)].map(([match]) => match.replace(/[.,;:!?]+$/, ''));
}

/** `<img>` tags that are 1×1 or hidden: the shape of an open-tracking pixel. */
function trackingPixels(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => {
      const size = (name: string) => {
        const attribute = new RegExp(`\\s${name}\\s*=\\s*["']?(\\d+)`, 'i').exec(tag);
        const style = new RegExp(`${name}\\s*:\\s*(\\d+)(px)?\\s*(;|"|')`, 'i').exec(tag);
        const value = attribute?.[1] ?? style?.[1];
        return value === undefined ? undefined : Number(value);
      };
      const width = size('width');
      const height = size('height');
      return (
        (width !== undefined && width <= 1) ||
        (height !== undefined && height <= 1) ||
        /display\s*:\s*none|visibility\s*:\s*hidden/i.test(tag)
      );
    });
}

/**
 * AC5: no tracking pixel, no link through a redirect or tracker, no link to another host than
 * `fivvi.app` (an address shown as text is fine), in the HTML and in the text part, in both
 * languages. The `List-Unsubscribe` header is a property of the message, checked on the
 * request of the transport (`catalog.test.ts`).
 */
export async function checkLinks<Props>(
  template: EmailTemplate<Props>,
  options: LinkOptions,
): Promise<string[]> {
  const problems: string[] = [];
  const rendered = await renderBoth(template, template.previewProps, problems);
  for (const [locale, { email }] of rendered) {
    if (trackingPixels(email.html).length > 0) {
      problems.push(`${locale}: the html has a tracking pixel`);
    }
    for (const tag of ['script', 'iframe', 'object', 'embed']) {
      if (new RegExp(`<${tag}\\b`, 'i').test(email.html)) {
        problems.push(`${locale}: the html has a <${tag}>`);
      }
    }
    for (const [part, references] of [
      ['html', htmlReferences(email.html)],
      ['text', textReferences(email.text)],
    ] as const) {
      for (const reference of references) {
        const problem = checkUrl(reference, options);
        if (problem) problems.push(`${locale}: ${part}: ${problem}`);
      }
    }
  }
  return problems;
}

// -- AC6: user content is escaped, as typed, in the recipient's language ---------------------

const hostileText = '<b>Tom&Co</b>';
const hostileDutch = '<b>Les&nl</b>';
const hostileEnglish = '<b>Class&en</b>';

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');

const squash = (text: string) => text.replace(/\s+/g, ' ');

/** What `value` looks like in a rendered email: problems when it is not escaped and as typed. */
function checkShownAsTyped(locale: Locale, name: string, value: string, email: RenderedEmail) {
  const escaped = escapeHtml(value);
  if (email.html.includes(value)) {
    return [`${locale}: ${name} reaches the html not escaped`];
  }
  if (!email.html.toLowerCase().includes(escaped.toLowerCase())) {
    return [`${locale}: ${name} is not shown`];
  }
  if (!email.html.includes(escaped)) {
    return [`${locale}: ${name} is not shown as typed (it is changed on the way)`];
  }
  if (!squash(email.text).includes(value)) {
    return [`${locale}: ${name} is not shown as typed in the plain-text part`];
  }
  return [];
}

/**
 * AC6: text people typed (a class name, a client's name, an owner's message) is shown as typed:
 * `<b>` and `&` are escaped in the HTML and unchanged in the text part, in both languages. A name
 * with a Dutch and an English text follows F021's rule (the English text when the recipient reads
 * English and there is one, else the Dutch text) and is never translated. The props come from
 * the template's `userContent`.
 */
export async function checkContent<Props>(template: EmailTemplate<Props>): Promise<string[]> {
  const problems: string[] = [];
  const base = template.previewProps;

  for (const entry of template.userContent as readonly UserContentProp<Props>[]) {
    if (typeof entry === 'string') {
      const props = { ...base, [entry]: hostileText } as Props;
      const rendered = await renderBoth(template, props, problems);
      for (const [locale, { email }] of rendered) {
        problems.push(...checkShownAsTyped(locale, entry, hostileText, email));
      }
      continue;
    }

    const name = `${entry.nl}/${entry.en}`;
    const withTexts = (en: string | null) =>
      ({ ...base, [entry.nl]: hostileDutch, [entry.en]: en }) as Props;
    const both = await renderBoth(template, withTexts(hostileEnglish), problems);
    for (const [locale, { email }] of both) {
      const reads = locale === 'en' ? hostileEnglish : hostileDutch;
      const other = locale === 'en' ? hostileDutch : hostileEnglish;
      const language = locale === 'en' ? 'English' : 'Dutch';
      const shown = checkShownAsTyped(locale, name, reads, email);
      if (shown.length > 0) {
        problems.push(
          `${locale}: the ${language} name is not shown to a reader of ${language} (${name})`,
          ...shown,
        );
      }
      if (email.html.includes(escapeHtml(other)) || squash(email.text).includes(other)) {
        problems.push(
          `${locale}: the ${locale === 'en' ? 'Dutch' : 'English'} name is shown to a reader of ${language} (${name})`,
        );
      }
    }
    // No English text (none, empty or blank): an English reader gets the Dutch one.
    for (const blank of [null, '', '  ']) {
      const rendered = await renderOnce(template, withTexts(blank), 'en').catch(() => undefined);
      if (!rendered) {
        problems.push(`en: does not render without an English name (${name})`);
      } else if (!rendered.email.html.includes(escapeHtml(hostileDutch))) {
        problems.push(
          `en: without an English name the Dutch name is not shown (${name}, ${JSON.stringify(blank)})`,
        );
      }
    }
  }
  return problems;
}

// -- AC7: the preview shows synthetic data only ----------------------------------------------

/**
 * Synthetic data only: every email address in the rendered email is on `example.com`, and the
 * only host a link leads to is `fivvi.app` (`checkLinks`). Real people and real gyms never get
 * into the preview or the tests.
 */
export async function checkSyntheticData<Props>(template: EmailTemplate<Props>): Promise<string[]> {
  const problems: string[] = [];
  const rendered = await renderBoth(template, template.previewProps, problems);
  for (const [locale, { email }] of rendered) {
    for (const part of [email.subject, email.text, decodeEntities(email.html)]) {
      for (const [address] of part.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)) {
        if (!/@example\.com$/i.test(address)) {
          problems.push(`${locale}: ${address} is not an example.com address`);
        }
      }
    }
  }
  return [...new Set(problems)];
}

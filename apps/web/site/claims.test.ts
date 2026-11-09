import { readFileSync } from 'node:fs';
import path from 'node:path';
import { locales, messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import { audiencePageIds } from './audience/audience-data';

/**
 * F064 AC19 (#611, #648): every claim on the site is true at launch, or says it is coming. The check
 * of the go-live ticket is the table in its notes; this is the part of it that a machine repeats,
 * "when a milestone lands" (AC19). Each claim of the site that depends on the product names the
 * features it needs, and `docs/product/FEATURES.md` says what is built:
 *
 * - a claim marked `ready` needs every one of its features `IMPLEMENTED`, otherwise it is not true;
 * - any other claim says that it is coming (or sits under a `caption` that does), in both languages,
 *   and needs at least one feature that is not `IMPLEMENTED`: when its last feature lands, this
 *   fails and the claim is rechecked and reworded as a fact, which is the repeated check.
 *
 * Text that is not a claim about the product (a headline, a problem the visitor recognises, a
 * label) is not in the table.
 */
const FEATURES_FILE = path.resolve(import.meta.dirname, '../../../docs/product/FEATURES.md');

/** The status of every feature and enabler in the registry, by ID. */
function featureStatuses(): Map<string, string> {
  const statuses = new Map<string, string>();
  for (const line of readFileSync(FEATURES_FILE, 'utf8').split('\n')) {
    const row =
      /^\| \[?([FE]\d{3})\]?(?:\(https[^)]*\))? \| .*? \| (IDEA|PLANNED|DESIGNED|IN PROGRESS|IN REVIEW|IMPLEMENTED|RELEASED)\b/.exec(
        line,
      );
    if (row?.[1] && row[2]) statuses.set(row[1], row[2]);
  }
  return statuses;
}
const statuses = featureStatuses();
const isBuilt = (feature: string) =>
  ['IMPLEMENTED', 'RELEASED'].includes(statuses.get(feature) ?? '');

interface Claim {
  /** The catalog key (without the leading `site.`) of the text that makes the claim. */
  key: string;
  /** The features the claim needs. */
  features: readonly string[];
  ready?: true;
  /** The key of the caption above the claim that says it is coming, when its own text does not. */
  caption?: string;
}

function text(locale: (typeof locales)[number], key: string): string {
  let node: unknown = messages[locale].site;
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'string') throw new Error(`site.${key} is not a text of ${locale}`);
  return node;
}

/** What "coming" sounds like in each language. A deliberate, small list: a reworded claim uses one. */
const COMING: Record<(typeof locales)[number], RegExp> = {
  en: /\b(soon|coming|will|won't|building|being built)\b/i,
  'nl-NL': /\b(straks|komt|komen|eraan|bouwen|gebouwd|binnenkort)\b/i,
};

/** The features each audience page's working day shows (`audience-data.ts`). */
const DAY_FEATURES: Record<(typeof audiencePageIds)[number], readonly string[]> = {
  gyms: ['F014', 'F024', 'F052', 'F057', 'F055'],
  studios: ['F027', 'F062', 'F054', 'F067', 'F068'],
  personalTrainers: ['F013', 'F043', 'F055', 'F066'],
  clients: ['F027', 'F031', 'F062', 'F033', 'F069'],
};

const claims: Claim[] = [
  // The home page.
  { key: 'meta.homeDescription', features: ['F013', 'F053', 'F057', 'F059'] },
  { key: 'home.lead', features: ['F013', 'F053', 'F057', 'F059'] },
  { key: 'home.audience.gym.short', features: ['F014', 'F057'] },
  { key: 'home.audience.studio.short', features: ['F027', 'F062'] },
  { key: 'home.audience.pt.short', features: ['F013', 'F043', 'F055'] },
  { key: 'home.audience.client.short', features: ['F027', 'F031'] },
  { key: 'home.onePlace.lead', features: ['F052', 'F057', 'F059'] },
  { key: 'home.chain.lead', features: ['F054', 'F057', 'F059'] },
  ...(['pack', 'payment', 'invoice', 'booking', 'attendance', 'balance'] as const).map((step) => ({
    key: `home.chain.steps.${step}.text`,
    features: ['F054', 'F057', 'F059', 'F031', 'F025', 'F055'],
    caption: 'home.chain.lead',
  })),
  { key: 'home.forWhom.lead', features: ['F068', 'F052'] },
  { key: 'home.platforms.lead', features: ['E017', 'F027'] },
  ...(
    [
      'proIphone',
      'proAndroid',
      'proLaptop',
      'clientIphone',
      'clientAndroid',
      'clientBrowser',
    ] as const
  ).map((item) => ({
    key: `home.platforms.items.${item}.text`,
    features: ['E017', 'F027'],
    caption: 'home.platforms.lead',
  })),
  { key: 'home.promises.items.money.text', features: ['E019', 'F057'] },
  { key: 'home.promises.items.cash.text', features: ['F065'] },
  { key: 'home.promises.items.notes.text', features: ['F046', 'F048'] },
  { key: 'home.promises.items.amounts.text', features: ['F052', 'F057'] },
  { key: 'home.promises.items.noApp.text', features: ['F029', 'F027'] },
  { key: 'home.promises.items.money.title', features: ['E019', 'F057'] },
  { key: 'home.promises.items.cash.title', features: ['F065'] },
  { key: 'home.promises.items.notes.title', features: ['F046', 'F048'] },
  { key: 'home.promises.items.amounts.title', features: ['F052', 'F057'] },
  { key: 'home.promises.items.noApp.title', features: ['F029', 'F027'] },
  { key: 'home.promises.items.languages.text', features: ['F010'], ready: true },
  // The four audience pages: their leads, their descriptions and every moment of their day.
  ...audiencePageIds.flatMap((page) => [
    { key: `audience.${page}.lead`, features: DAY_FEATURES[page] },
    { key: `audience.${page}.metaDescription`, features: DAY_FEATURES[page] },
    ...Object.keys(messages.en.site.audience[page].moments).map((moment) => ({
      key: `audience.${page}.moments.${moment}.answer`,
      features: DAY_FEATURES[page],
      caption: 'audience.dayLead',
    })),
  ]),
  // Pricing.
  { key: 'pricing.includedLabel', features: ['F013', 'F053', 'F059', 'E017', 'F027'] },
  ...(['calendar', 'memberships', 'pro', 'client'] as const).map((item) => ({
    key: `pricing.included.${item}`,
    features: ['F013', 'F053', 'F059', 'E017', 'F027'],
    caption: 'pricing.includedLabel',
  })),
  { key: 'pricing.payments.answer', features: ['E019', 'F057'] },
  { key: 'pricing.clients.answer', features: ['F027', 'E017'] },
  { key: 'pricing.metaDescription', features: [], ready: true },
  { key: 'pricing.later.answer', features: [], ready: true },
  // Help.
  { key: 'support.clientFaq.join.answer', features: ['F029', 'F031'] },
  { key: 'support.clientFaq.noCode.answer', features: ['F001'], ready: true },
  { key: 'support.clientFaq.cancel.answer', features: ['F026', 'F056'] },
  { key: 'support.clientFaq.invoices.answer', features: ['F059'] },
  { key: 'support.clientFaq.deleteAccount.answer', features: ['F001'], ready: true },
  { key: 'support.ownerFaq.payments.answer', features: ['E019', 'F057'] },
  { key: 'support.ownerFaq.mollie.answer', features: ['E019', 'F065'] },
  { key: 'support.ownerFaq.devices.answer', features: ['E017', 'F027'] },
  { key: 'support.ownerFaq.data.answer', features: ['F046'] },
  // The demo.
  { key: 'demo.lead', features: ['F013', 'F053'] },
  { key: 'demo.metaDescription', features: ['F013', 'F053'] },
];

describe('F064 AC19 the claims of the site are true or say they are coming', () => {
  it('reads the status of every feature the table names', () => {
    for (const claim of claims) {
      for (const feature of claim.features) {
        expect(statuses.has(feature), `${feature} of site.${claim.key} is in FEATURES.md`).toBe(
          true,
        );
      }
    }
  });

  it('has every claim in both languages, and every key is a text', () => {
    for (const claim of claims) {
      for (const locale of locales) {
        expect(text(locale, claim.key).trim(), `${locale} site.${claim.key}`).not.toBe('');
      }
    }
  });

  it('marks a claim ready only when every feature it needs is IMPLEMENTED', () => {
    for (const claim of claims.filter((candidate) => candidate.ready)) {
      const open = claim.features.filter((feature) => !isBuilt(feature));
      expect(
        open,
        `site.${claim.key} says it as a fact, but ${open.join(', ')} is not built`,
      ).toEqual([]);
    }
  });

  it.each(locales)(
    'says in %s that a claim is coming when a feature behind it is not built',
    (locale) => {
      for (const claim of claims.filter((candidate) => !candidate.ready)) {
        const open = claim.features.filter((feature) => !isBuilt(feature));
        expect(
          open.length,
          `every feature behind site.${claim.key} is built now: recheck the claim and say it as a fact (AC19)`,
        ).toBeGreaterThan(0);
        const said = text(locale, claim.caption ?? claim.key);
        expect(said, `${locale} site.${claim.caption ?? claim.key} says it is coming`).toMatch(
          COMING[locale],
        );
      }
    },
  );
});

describe('F064 AC19 what counts as "coming"', () => {
  it('does not accept a sentence that says something is ready, or done once', () => {
    expect(COMING.en.test('The calendar is ready')).toBe(false);
    expect(COMING.en.test('Bookings work once you sign in')).toBe(false);
    expect(COMING['nl-NL'].test('De agenda is klaar')).toBe(false);
    expect(COMING['nl-NL'].test('Zodra je inlogt werkt het')).toBe(false);
    expect(COMING.en.test('The calendar is coming')).toBe(true);
    expect(COMING['nl-NL'].test('De agenda komt eraan')).toBe(true);
  });
});

describe('F064 AC19 the help page names the reply time the owner confirmed (#612, Q14)', () => {
  it('says 2 working days in Dutch and in English', () => {
    expect(text('nl-NL', 'support.lead')).toMatch(/\b2 werkdagen\b/);
    expect(text('en', 'support.lead')).toMatch(/\b2 working days\b/);
  });
});

describe('F064 AC19 every page says Fivvi is being built with its first gym and the demo shows what is ready', () => {
  it('has the one status line in both languages', () => {
    expect(text('en', 'home.status')).toMatch(/being built/i);
    expect(text('en', 'home.status')).toMatch(/first gym/i);
    expect(text('en', 'home.status')).toMatch(/demo/i);
    expect(text('nl-NL', 'home.status')).toMatch(/gebouwd/i);
    expect(text('nl-NL', 'home.status')).toMatch(/eerste sportschool/i);
    expect(text('nl-NL', 'home.status')).toMatch(/demo/i);
  });
});

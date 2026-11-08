import type { Locale } from '@fivvi/i18n';

// Its own file, without the template: `packages/api` imports this type through the package's
// `./demo-request-mail` export, and the API cannot load or type-check the `.tsx` templates.

/** The kind of business a visitor runs, as the demo form offers it. */
export type DemoBusinessKind = 'gym' | 'studio' | 'personal-trainer';

/** How many trainers the business has, as the demo form offers it. */
export type DemoTrainerCount = 'one' | 'two-to-four' | 'five-or-more';

/**
 * What the demo request email needs (F064, spec #611); the route of `packages/api` decides every
 * field. The email goes to Fivvi's own support address, never to the visitor, so these are the
 * visitor's words, kept in this email and nowhere else.
 */
export interface DemoRequestMail {
  name: string;
  /** The visitor's address, shown in the email so it can be answered; it is never written to. */
  email: string;
  businessKind: DemoBusinessKind;
  trainerCount: DemoTrainerCount;
  /** What the visitor would most like to see; `null` when left empty (the line is left out). */
  message: string | null;
  /** The language of the website page the visitor used: the language to answer in. */
  locale: Locale;
}

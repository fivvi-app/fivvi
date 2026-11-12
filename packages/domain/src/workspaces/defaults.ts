import { CLIENT_NAME_MAX_LENGTH } from '../clients/new-client.ts';

/** What a new workspace starts with; the owner is asked none of it (F002 AC2). */
export const WORKSPACE_DEFAULTS = {
  /** The default communication language (`PRODUCT.md §3`); F010 makes it editable. */
  defaultLocale: 'nl-NL',
  /** The IANA zone dates and times are shown in (ADR-012); nothing edits it in the MVP. */
  timeZone: 'Europe/Amsterdam',
} as const;

/** The longest workspace name, in characters (F002 AC3). */
export const NAME_MAX_LENGTH = 80;

/**
 * The longest name a person gives for their own account, in characters (F030 AC4): the same as a
 * client's name in a workspace (F006), so the name asked once fits wherever a gym shows it.
 */
export const PERSON_NAME_MAX_LENGTH = CLIENT_NAME_MAX_LENGTH;

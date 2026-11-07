/**
 * The first-party cookie that remembers the last workspace used in this browser (F012): its URL
 * name and nothing else, so no personal data. It is per browser, never per account: nothing about
 * the current workspace is stored on the server.
 */
export const LAST_WORKSPACE_COOKIE = 'fivvi_last_workspace';

/** How long the browser keeps it: a year, renewed whenever a workspace is opened. */
export const LAST_WORKSPACE_MAX_AGE = 365 * 24 * 60 * 60;

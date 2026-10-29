import { type Locale, SIGN_IN_LANGUAGE_COOKIE } from '@fivvi/i18n';
import { localeCookie } from '../../i18n/config';

/** A year: the language stays on this browser until someone chooses another one (AC6). */
const LANGUAGE_MAX_AGE = 365 * 24 * 60 * 60;

/** A day: long enough to open the emailed link later, short enough not to outlive the attempt. */
const CHOICE_MAX_AGE = 24 * 60 * 60;

/**
 * Records a language chosen on the sign-in page in this browser (F010): `NEXT_LOCALE`, which the
 * page and the sign-in email follow and which stays after sign-out, and the sign-in choice,
 * which signing in saves on the account and then removes. `target` is `document`.
 */
export function chooseSignInLanguage(locale: Locale, target: { cookie: string }) {
  const attributes = 'path=/; samesite=lax';
  target.cookie = `${localeCookie}=${locale}; ${attributes}; max-age=${LANGUAGE_MAX_AGE}`;
  target.cookie = `${SIGN_IN_LANGUAGE_COOKIE}=${locale}; ${attributes}; max-age=${CHOICE_MAX_AGE}`;
}

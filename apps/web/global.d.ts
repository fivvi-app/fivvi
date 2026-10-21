import type { dateTimeFormats, FormattingLocale, Messages } from '@fivvi/i18n';

// Types next-intl's keys, locales and format names from the catalogs.
declare module 'next-intl' {
  interface AppConfig {
    Locale: FormattingLocale;
    Messages: Messages;
    Formats: { dateTime: typeof dateTimeFormats };
  }
}

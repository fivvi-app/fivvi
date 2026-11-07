import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { pageCopy, pageSeo } from './seo';

/** The title and description of the demo page in a language (unique per page, AC12). */
export function demoMetadata(locale: Locale): Metadata {
  return pageSeo('demo', locale, pageCopy('demo', locale));
}

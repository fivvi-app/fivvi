import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { pageCopy, pageSeo } from '../seo';
import type { AudiencePageId } from './audience-data';

/** The title and description of an audience page in a language (unique per page, AC12). */
export function audienceMetadata(page: AudiencePageId, locale: Locale): Metadata {
  return pageSeo(page, locale, pageCopy(page, locale));
}

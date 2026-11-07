import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { siteText } from '../text';
import type { AudiencePageId } from './audience-data';

/** The title and description of an audience page in a language (unique per page, AC12). */
export function audienceMetadata(page: AudiencePageId, locale: Locale): Metadata {
  const t = siteText(locale);
  return {
    title: t(`site.audience.${page}.metaTitle`),
    description: t(`site.audience.${page}.lead`),
  };
}

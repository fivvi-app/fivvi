import type { Locale } from '@fivvi/i18n';
import type { Metadata } from 'next';
import { siteText } from './text';

/** The title and description of the demo page in a language (unique per page, AC12). */
export function demoMetadata(locale: Locale): Metadata {
  const t = siteText(locale);
  return { title: t('site.demo.metaTitle'), description: t('site.demo.metaDescription') };
}

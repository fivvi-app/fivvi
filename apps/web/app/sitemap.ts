import type { MetadataRoute } from 'next';
import { sitemapEntries } from '../site/indexing';

// Static: the list of pages and their addresses are known at build time (F064 AC13).
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}

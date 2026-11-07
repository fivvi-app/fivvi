import type { MetadataRoute } from 'next';
import { robotsTxt } from '../site/indexing';

// Built when asked for, not at build time: the same Docker image serves production, development
// and every preview, and only production may be found by a search engine (F064 AC13). The
// environment is read from the running server.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return robotsTxt();
}

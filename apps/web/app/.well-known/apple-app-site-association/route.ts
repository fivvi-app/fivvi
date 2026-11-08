import { appleAppSiteAssociation, associationResponse } from '../../../server/app-links';

// Read from the environment on every request, not at build time (E017 AC5): the same build runs
// in production, where the value is set, and in previews, where it is not.
export const dynamic = 'force-dynamic';

export function GET() {
  return associationResponse(appleAppSiteAssociation());
}

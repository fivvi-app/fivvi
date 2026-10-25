import type { NextRequest } from 'next/server';
import { auth } from './server/auth';
import { guardRequest } from './server/route-guard';

// The route guard (F001 AC13): every trainer-web page needs sign-in unless it is public
// (server/route-guard.ts). Next.js runs this before the page renders, on the Node.js runtime.
export function proxy(request: NextRequest) {
  return guardRequest(request, (headers) => auth().readSession(headers));
}

export const config = {
  // Everything but the build's own files; which paths are public is decided in the guard.
  matcher: ['/((?!_next/|favicon\\.ico$).*)'],
};

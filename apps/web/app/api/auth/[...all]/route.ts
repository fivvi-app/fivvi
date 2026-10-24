import { auth } from '../../../../server/auth';

// Better Auth's endpoints under /api/auth/*, used by the sign-in page with cookies (F001). More
// specific than the catch-all of packages/api next to it, and not part of the OpenAPI contract:
// the native apps get their own sign-in routes in the contract (spec #168).
const handler = (request: Request) => auth().handler(request);

export { handler as GET, handler as POST };

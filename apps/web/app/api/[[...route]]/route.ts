import { apiHandler as handler } from '../../../server/api';

// Serves packages/api under /api, with the dependencies wired in server/api.ts. Next.js answers
// HEAD and OPTIONS itself.
export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };

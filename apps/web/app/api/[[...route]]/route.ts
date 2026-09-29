import { createApiHandler } from '@trainer-hub/api';

// Serves packages/api under /api. Routes, validation and the contract live in packages/api.
// Next.js answers HEAD and OPTIONS itself.
const handler = createApiHandler();

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };

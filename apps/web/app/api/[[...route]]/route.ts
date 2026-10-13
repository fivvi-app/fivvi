import { createApiHandler } from '@trainer-hub/api';
import { pingDatabase } from '@trainer-hub/database';
import { database } from '../../../server/database';

// Serves packages/api under /api. Routes, validation and the contract live in packages/api;
// this file only wires in the real dependencies. Next.js answers HEAD and OPTIONS itself.
const handler = createApiHandler({ pingDatabase: () => pingDatabase(database()) });

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT };

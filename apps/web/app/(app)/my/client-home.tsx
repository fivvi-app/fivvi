import type { Studio } from './client-studio';
import { ClientStudios } from './client-studios';
import { NoWorkspace } from './no-workspace';

/**
 * What the client home shows under its title (F030): the client's studios, or, as a client of
 * none, where to ask for a studio's link.
 */
export function ClientHome({ studios }: { studios: readonly Studio[] }) {
  return studios.length > 0 ? <ClientStudios studios={studios} /> : <NoWorkspace />;
}

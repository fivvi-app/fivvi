import { currentMe, homeDestination, redirectTo } from '../../../../server/signed-in';

/**
 * The signed-in home (`/home`, F002): the page sign-in ends at when none was asked for. It sends
 * each person to the right place from `GET /v1/me` and nothing else (F030): the workspace's home
 * they used last in this browser, else the first by name (F012), TW-11 when they may set a
 * workspace up, otherwise the client web (`/my`), where an account that is only a client, or
 * nothing yet, belongs. The route guard (`proxy.ts`) keeps anonymous visitors out.
 */
export default async function HomePage(): Promise<never> {
  return redirectTo(await homeDestination(await currentMe()));
}

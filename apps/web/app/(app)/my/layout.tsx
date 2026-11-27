import { ClientLayout } from '@fivvi/ui/kit/client-layout';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { currentMe } from '../../../server/signed-in';
import { startWorkspace } from '../../../server/start-workspace';
import { ClientLanguageSwitch } from './client-language-switch';
import { CLIENT_STUDIO_COOKIE } from './client-studio';
import { ClientTabs } from './client-tabs';
import { StudioSwitcher } from './studio-switcher';

/**
 * The client web (F030, `docs/design/prototype-v2/DECISIONS.md` §5, §5b and §6): a phone-first
 * website in Fivvi Pro's design language, for a person who is only a client or nothing yet. The
 * tabs are *Home · Boeken · Profiel* as in the app (*Activiteit* comes with M7), the header has
 * *NL | EN* on every page, and on *Boeken* the studio switcher before it. There is no account
 * menu: *Uitloggen* is on *Profiel*. The route guard (`proxy.ts`) keeps anonymous visitors out,
 * like every page outside `PUBLIC_PREFIXES`.
 */
export default async function ClientWebLayout({ children }: { children: ReactNode }) {
  const studios = (await currentMe()).clientWorkspaces;
  const current = startWorkspace(studios, (await cookies()).get(CLIENT_STUDIO_COOKIE)?.value);
  return (
    <ClientLayout
      header={
        <>
          {current ? <StudioSwitcher studios={studios} current={current.slug} /> : null}
          <ClientLanguageSwitch />
        </>
      }
      tabs={<ClientTabs />}
    >
      {children}
    </ClientLayout>
  );
}

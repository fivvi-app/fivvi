import { ClientLayout } from '@fivvi/ui/kit/client-layout';
import type { ReactNode } from 'react';
import { ClientLanguageSwitch } from './client-language-switch';
import { ClientTabs } from './client-tabs';

/**
 * The client web (F030, `docs/design/prototype-v2/DECISIONS.md` §5, §5b and §6): a phone-first
 * website in Fivvi Pro's design language, for a person who is only a client or nothing yet. The
 * tabs are *Home · Boeken · Profiel* as in the app (*Activiteit* comes with M7), the header has
 * *NL | EN* on every page and there is no account menu: *Uitloggen* is on *Profiel*. The route
 * guard (`proxy.ts`) keeps anonymous visitors out, like every page outside `PUBLIC_PREFIXES`.
 */
export default function ClientWebLayout({ children }: { children: ReactNode }) {
  return (
    <ClientLayout header={<ClientLanguageSwitch />} tabs={<ClientTabs />}>
      {children}
    </ClientLayout>
  );
}

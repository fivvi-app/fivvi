import type { ReactNode } from 'react';
import { SignOutButton } from './sign-out-button';

/**
 * The pages that need sign-in (the route guard, `proxy.ts`): *Uitloggen* / *Sign out* on every
 * one of them (F001, AC12). Trainer Web's navigation joins it in the layout with F002.
 *
 * Keep this group in step with `PUBLIC_PREFIXES` in `server/route-guard.ts`: a page outside
 * `(signed-in)` that is not public is guarded but has no *Sign out*; a page in it that is public
 * shows *Sign out* to visitors who are not signed in.
 */
export default function SignedInLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex justify-end p-4">
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}

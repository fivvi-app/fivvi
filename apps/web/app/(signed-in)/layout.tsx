import type { ReactNode } from 'react';
import { SignOutButton } from './sign-out-button';

/**
 * The pages that need sign-in (the route guard, `proxy.ts`): *Uitloggen* / *Sign out* on every
 * one of them (F001, AC12). Trainer Web's navigation joins it in the layout with F002.
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

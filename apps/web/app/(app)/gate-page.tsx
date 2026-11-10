import { Card } from '@fivvi/ui/components/card';
import type { ReactNode } from 'react';

/**
 * The page of the screens a person meets before there is a workspace to be in: sign-in, the
 * confirm link, the first-run welcome and the no-access page. A 400 px card on the sidebar fill
 * (the prototype's gate pages). `standalone` is for a page with no frame above it (the sign-in,
 * which fills the window); inside the signed-in layout the page fills what the header leaves.
 * `above` sits over the card, such as the language switch.
 */
export function GatePage({
  standalone = false,
  above,
  children,
}: {
  standalone?: boolean;
  above?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className={`flex flex-col items-center justify-center gap-3 bg-sidebar p-6 ${standalone ? 'min-h-dvh' : 'flex-1'}`}
    >
      {above ? <div className="flex w-full max-w-100 justify-end">{above}</div> : null}
      <Card className="w-full max-w-100 shadow-xs [--card-spacing:--spacing(5)]">{children}</Card>
    </main>
  );
}

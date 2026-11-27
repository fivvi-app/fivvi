import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';

/**
 * The client web's layout: the Fivvi Pro theme (`data-theme="client"`: the grouped grey canvas,
 * radius 26, the darker secondary text), the touch density, a glass header that stays on top and
 * the page in a column. With `tabs` (the tab bar of the signed-in client web, F030) a glass bar
 * stays at the bottom of the window and the page leaves room for it. Nothing switches theme at
 * runtime. A page outside this layout, such as the public website, puts `data-theme="client"` on
 * its own root element.
 */
export function ClientLayout({
  header,
  tabs,
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & {
  header: ReactNode;
  /** The tab bar: a `nav` with its own name. */
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      data-slot="client-layout"
      data-theme="client"
      data-density="touch"
      className={cn('min-h-dvh bg-background text-foreground', className)}
      {...props}
    >
      <header data-slot="client-header" className="glass sticky top-0 z-40">
        <div className="mx-auto flex min-h-14 max-w-xl items-center gap-3 px-4">{header}</div>
      </header>
      <main className={cn('mx-auto w-full max-w-xl px-4 pt-4', tabs ? 'pb-28' : 'pb-10')}>
        {children}
      </main>
      {tabs ? (
        <div
          data-slot="client-tabs"
          className="glass fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto max-w-xl px-2">{tabs}</div>
        </div>
      ) : null}
    </div>
  );
}

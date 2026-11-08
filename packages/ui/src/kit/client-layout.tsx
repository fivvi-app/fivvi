import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';

/**
 * The client web's layout: the Fivvi Pro theme (`data-theme="client"`: the grouped grey canvas,
 * radius 26, the darker secondary text), the touch density, a glass header that stays on top and
 * the page in a column. Nothing switches theme at runtime. A page outside this layout, such as the
 * public website, puts `data-theme="client"` on its own root element.
 */
export function ClientLayout({
  header,
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { header: ReactNode; children: ReactNode }) {
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
      <main className="mx-auto w-full max-w-xl px-4 pt-4 pb-10">{children}</main>
    </div>
  );
}

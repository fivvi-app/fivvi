import { cn } from 'cn';
import type { ComponentProps } from 'react';

/**
 * The page of the trainer web (the prototype's `.w-page`): 24px at the sides, 20px above and 40px
 * below, in a column of at most 1100px with 16px between its blocks. Put the heading (`h1`) and the
 * cards in it.
 */
export function PageShell({ className, children, ...props }: ComponentProps<'main'>) {
  return (
    <main data-slot="page-shell" className={cn('flex-1 px-6 pt-5 pb-10', className)} {...props}>
      <div data-slot="page-shell-column" className="grid max-w-275 content-start gap-4">
        {children}
      </div>
    </main>
  );
}

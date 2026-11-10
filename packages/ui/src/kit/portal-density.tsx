'use client';

import { createContext, type ReactNode, useContext, useState } from 'react';

/** The element the kit's dialogs and menus render in; none outside a `PortalDensity`. */
const PortalContainer = createContext<HTMLElement | null>(null);

/**
 * Where a portal renders: the `PortalDensity` host around the caller, or `undefined`, which is
 * `<body>` (Radix's default, and so the touch density of the root layout). The kit's dialog and
 * menu components pass it as their portal's `container`; a new component with a portal must too
 * (`packages/ui/test/portal-density.test.tsx` fails otherwise).
 */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainer) ?? undefined;
}

/**
 * Gives the dialogs and menus opened inside it the density of its layout (E020, #1258). They render
 * in a portal, which Radix puts on `<body>` by default; there `data-density` is the root layout's
 * `touch`, whatever density the layout that opened them has. This renders a host element next to
 * the children, with `data-density`, and the kit's portals render in it, so the nearest density
 * rule applies to them as to the page. The host takes no space (`display: contents`).
 *
 * A layout that sets `data-density` wraps its content in this with the same density. Pages that
 * don't (the public and client pages) keep the portal on `<body>` at the touch density.
 */
export function PortalDensity({
  density,
  children,
}: {
  density: 'compact' | 'touch';
  children: ReactNode;
}) {
  // State, not a ref: the context must change when the host mounts, so the consumers render again.
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <PortalContainer value={host}>
      {children}
      <div ref={setHost} data-slot="portal-density" data-density={density} className="contents" />
    </PortalContainer>
  );
}

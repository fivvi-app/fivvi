import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PortalDensity, usePortalContainer } from '../src/kit/portal-density';

// The dialogs and menus of the kit render in a portal. Opening one needs a browser, so e2e/portal-density.spec.ts
// proves the densities; these tests keep the pieces it relies on.
describe('E020 portal density', () => {
  it('AC1: renders a host with the density next to the children, which takes no space', () => {
    const markup = renderToStaticMarkup(
      <PortalDensity density="compact">
        <p>Anna</p>
      </PortalDensity>,
    );

    expect(markup).toBe(
      '<p>Anna</p><div data-slot="portal-density" data-density="compact" class="contents"></div>',
    );
  });

  it('AC3: outside a host there is no container, so a portal stays on <body> at the touch density', () => {
    function Probe() {
      return <p>{String(usePortalContainer())}</p>;
    }

    expect(renderToStaticMarkup(<Probe />)).toBe('<p>undefined</p>');
  });

  it('AC1: every portal of the kit renders in the host', async () => {
    const directory = path.resolve(import.meta.dirname, '../src/components');
    const portals: string[] = [];
    for (const file of await readdir(directory)) {
      const source = await readFile(path.join(directory, file), 'utf8');
      // Each `Portal` of a Radix primitive (`<DialogPrimitive.Portal`) names its container.
      for (const use of source.matchAll(/<\w+Primitive\.Portal\b[^>]*>/gs)) {
        portals.push(
          `${file}: ${use[0].includes('container={usePortalContainer()}') ? 'ok' : use[0]}`,
        );
      }
    }

    expect(portals.length).toBeGreaterThanOrEqual(3);
    expect(portals.filter((portal) => !portal.endsWith(': ok'))).toEqual([]);
  });
});

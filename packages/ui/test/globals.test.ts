import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { compile } from '@tailwindcss/node';
import { describe, expect, it } from 'vitest';

// The stylesheet apps import (`@fivvi/ui/globals.css`), compiled as Tailwind compiles it in an app.
const stylesheet = path.resolve(import.meta.dirname, '../src/styles/globals.css');

async function compileKit() {
  return await compile(await readFile(stylesheet, 'utf8'), {
    base: path.dirname(stylesheet),
    from: stylesheet,
    onDependency: () => undefined,
  });
}

/** Whether Tailwind generates CSS for the class. A compiler accumulates classes, so use a fresh one. */
async function generates(candidate: string): Promise<boolean> {
  const kit = await compileKit();
  const without = kit.build([]);
  return kit.build([candidate]) !== without;
}

describe('E007 kit stylesheet', () => {
  it('AC7: offers the token colours and none of Tailwind’s default palette', async () => {
    for (const token of ['bg-primary', 'text-primary-foreground', 'ring-ring/50', 'border-input']) {
      expect(await generates(token), token).toBe(true);
    }
    for (const palette of ['bg-red-500', 'text-white', 'bg-black/50', 'border-neutral-200']) {
      expect(await generates(palette), palette).toBe(false);
    }
  });

  it('AC7: makes apps that import it scan the kit components', async () => {
    const kit = await compileKit();
    const components = path.resolve(import.meta.dirname, '../src/components');

    expect(kit.sources.map((source) => path.resolve(source.base, source.pattern))).toContain(
      components,
    );
  });
});

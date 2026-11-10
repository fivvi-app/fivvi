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

  it('AC14: makes apps that import it scan the kit blocks', async () => {
    const kit = await compileKit();
    const blocks = path.resolve(import.meta.dirname, '../src/kit');

    expect(kit.sources.map((source) => path.resolve(source.base, source.pattern))).toContain(
      blocks,
    );
  });

  it('AC14: the card radius is the radius.card token, 26px, in both themes', async () => {
    const kit = await compileKit();
    const css = kit.build(['rounded-card']);

    expect(css).toMatch(/border-radius:\s*var\(--th-radius-card\)/);
  });

  it('AC11: `numeric` is the rounded face with tabular digits, from the token', async () => {
    const kit = await compileKit();
    const css = kit.build(['numeric']);

    expect(css).toMatch(/font-family:\s*var\(--th-font-family-numeric\)/);
    expect(css).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it('AC13: `glass` is the glass tokens, and a solid fill when transparency is reduced', async () => {
    const kit = await compileKit();
    const css = kit.build(['glass']);

    expect(css).toContain('var(--th-color-web-glass-bg)');
    expect(css).toContain('var(--th-color-web-glass-edge)');
    expect(css).toMatch(/backdrop-filter:\s*blur\(/);
    expect(css).toMatch(
      /prefers-reduced-transparency:\s*reduce[\s\S]*var\(--th-color-web-glass-strong\)/,
    );
  });

  it('AC14: a focus ring inside an inset list is drawn inside the clipped list, in WCAG 2.4.7 terms visible', async () => {
    const kit = await compileKit();
    const css = kit.build([]);
    // The list clips its rows (rounded corners), so the 2px-offset ring of a row-filling link or
    // button is pulled inside. The rule is unlayered and comes after the base focus rule.
    const base = css.indexOf(':focus-visible {');
    const inset = css.search(
      /\[data-slot=["']?inset-list["']?\]\s+:focus-visible\s*\{[^}]*outline-offset:\s*-2px/,
    );

    expect(base, 'the base focus rule').toBeGreaterThan(-1);
    expect(inset, 'the inset list focus rule').toBeGreaterThan(base);
  });

  it('E020: the density sets the height of the confirmation dialog buttons too, which are a Button under another data-slot', async () => {
    const css = (await compileKit()).build([]).replaceAll(/\s+/g, ' ');
    const rule = css.match(/\[data-density\] :is\(([^)]*)\) \{ min-height/)?.[1] ?? '';

    for (const slot of [
      'button',
      'alert-dialog-action',
      'alert-dialog-cancel',
      'input',
      'native-select',
    ]) {
      expect(rule, slot).toContain(`[data-slot="${slot}"]`);
    }
  });
});

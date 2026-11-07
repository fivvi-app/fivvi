import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  clientColours,
  kotlinOutputs,
  renderOutputs,
  resolveTokens,
  shadcnColours,
  swiftOutputs,
  webOutputs,
} from '../src/build.ts';
import { runChecks } from '../src/check.ts';
import { mix } from '../src/colour.ts';
import { contrastRatio, contrastResults } from '../src/contrast.ts';
import { gradientProblems } from '../src/gradients.ts';
import {
  type Mode,
  minimumRatio,
  readTokenSource,
  semanticColours,
  type TokenSource,
  validate,
} from '../src/source.ts';
import { fnv1a, workspaceColour, workspaceColours } from '../src/workspace-colour.ts';
import { withValue } from './tokens.ts';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');

type Values = Record<Mode, Map<string, string>>;

async function valuesOf(source: TokenSource): Promise<Values> {
  const resolved = await resolveTokens(source);
  return {
    light: new Map(
      resolved.light.map((token) => [
        token.path,
        token.value.startsWith('#') ? token.value.toUpperCase() : token.value,
      ]),
    ),
    dark: new Map(
      resolved.dark.map((token) => [
        token.path,
        token.value.startsWith('#') ? token.value.toUpperCase() : token.value,
      ]),
    ),
  };
}

/** Light and dark `#RRGGBB` of the semantic colours in each row, as the decided values. */
const decided: [string, string, string][] = [
  ['color.bg.canvas', '#F2F2F7', '#000000'],
  ['color.bg.surface', '#FFFFFF', '#1C1C1E'],
  ['color.accent.fill', '#E6164A', '#E6164A'],
  ['color.accent.text', '#C8103D', '#FF6482'],
  ['color.accent.on', '#FFFFFF', '#FFFFFF'],
  ['color.session.private.solid', '#0088FF', '#0088FF'],
  ['color.session.group.solid', '#CB30E0', '#CB30E0'],
  ['color.session.open-gym.solid', '#FF8D28', '#FF8D28'],
  ['color.status.success.solid', '#34C759', '#34C759'],
  ['color.status.danger.solid', '#FF383C', '#FF383C'],
  // ADR-032: the native apps' grey, the client web's darker grey, and the trainer web's zinc.
  ['color.text.secondary', '#85858B', '#98989F'],
  ['color.web.client.secondary', '#6C6C70', '#98989F'],
  ['color.web.trainer.muted-foreground', '#71717A', '#A1A1AA'],
  // The danger fill that carries white text is the 85% mix with black (4.75:1).
  ['color.action.danger.bg', '#D93033', '#D93033'],
];

describe('E020 v2 token values', () => {
  let source: TokenSource;
  let values: Values;

  beforeAll(async () => {
    source = await readTokenSource(packageRoot);
    values = await valuesOf(source);
  });

  it('AC1: the decided values, light and dark', () => {
    for (const [token, light, dark] of decided) {
      expect(values.light.get(token), `${token} light`).toBe(light);
      expect(values.dark.get(token), `${token} dark`).toBe(dark);
    }
    // Primary actions are the accent; the text on them is the on-accent colour.
    expect(values.light.get('color.action.primary.bg')).toBe('#E6164A');
    expect(values.dark.get('color.action.primary.fg')).toBe('#FFFFFF');
  });

  it('AC1: radii, fonts and the type scale are the v2 ones', async () => {
    const outputs = await renderOutputs(source);
    expect(values.light.get('radius.card')).toBe('26px');
    expect(values.light.get('radius.md')).toBe('12px');
    expect(values.light.has('font.family.display')).toBe(false);
    expect(values.light.get('font.family.numeric')).toMatch(/^ui-rounded,/);
    expect(outputs.get(kotlinOutputs.layout)).toMatch(/val card: Dp = 28\.dp/);
    expect(outputs.get(swiftOutputs.layout)).toMatch(/static let card: CGFloat = 26/);
  });

  it('AC2: no M0 value is left in the source or the generated outputs', async () => {
    const m0 = [
      /595299/i,
      /bricolage/i,
      /petrol/i,
      /violet/i,
      /49427F|C1BBEB|D2CDF2/i, // the M0 primary action in its pressed states and in dark mode
      /E6F4F1|C4E6DF|94D2C6|5DB8A8|2E9C8B|13806F|0C6A5C|0A554A|0A433B|09332E/i, // petrol
      /F1ECFC|E0D6F8|B7A2EE|6D4BD1|4C2FA3|2E1C66/i, // violet
    ];
    const sources = [
      'palette',
      'color.light',
      'color.dark',
      'typography',
      'layout',
      'motion',
      'contrast-pairs',
    ].map((name) => [
      `tokens/${name}.json`,
      readFileSync(path.join(packageRoot, `tokens/${name}.json`), 'utf8'),
    ]);
    const generated = [...(await renderOutputs(source))].map(([file, content]) => [file, content]);
    for (const [file, content] of [...sources, ...generated]) {
      for (const pattern of m0) expect(content, `${file} has ${pattern}`).not.toMatch(pattern);
    }
  });

  it('AC4: one accent, defined once, and on-accent on every accent fill', async () => {
    // The accent hex is written once (the palette); no other accent exists.
    const written = ['palette', 'color.light', 'color.dark', 'contrast-pairs']
      .map((name) => readFileSync(path.join(packageRoot, `tokens/${name}.json`), 'utf8'))
      .join('\n');
    expect(written.match(/#E6164A/gi)).toHaveLength(1);
    const accents = semanticColours(source).filter((token) => /accent/i.test(token));
    expect(new Set(accents.map((token) => token.split('.').slice(0, 2).join('.')))).toEqual(
      new Set(['color.accent']),
    );
    expect(
      Object.keys((source.light.color as Record<string, unknown>).base as object),
    ).not.toContain('indigo');

    // Anything on an accent fill uses the on-accent colour.
    for (const mode of ['light', 'dark'] as const) {
      for (const pair of source.pairs) {
        if (values[mode].get(pair.bg) !== values[mode].get('color.accent.fill')) continue;
        expect(values[mode].get(pair.fg), `${pair.fg} on ${pair.bg}`).toBe(
          values[mode].get('color.accent.on'),
        );
      }
    }

    // Changing the accent means changing one place: everything derived from it follows.
    const changed = await valuesOf({
      ...source,
      light: withValue(source.light, 'color.base.accent.fill', '#2255DD'),
    });
    for (const token of [
      'color.accent.fill',
      'color.action.primary.bg',
      'color.action.primary.bg-pressed',
      'color.accent.gradient-top',
      'color.accent.gradient-bottom',
    ]) {
      expect(changed.light.get(token), token).not.toBe(values.light.get(token));
      expect(changed.dark.get(token), token).not.toBe(values.dark.get(token));
    }
    expect(changed.light.get('color.action.primary.bg')).toBe('#2255DD');
  });

  it('AC5: gradients stay in one hue, and a drifting pair fails', async () => {
    const checked = await runChecks(packageRoot, ['gradients'], source);
    expect(checked[0]?.problems).toEqual([]);

    const owners = [...values.light.keys()]
      .filter((token) => token.endsWith('.gradient-top'))
      .map((token) => token.replace('.gradient-top', ''))
      .sort();
    expect(owners).toEqual(
      [
        'color.accent',
        'color.session.group',
        'color.session.open-gym',
        'color.session.private',
        'color.status.danger',
        'color.status.success',
        'color.status.warning',
      ].sort(),
    );

    // A bottom in another hue ("too much to the purple") is refused, in either mode.
    const drifted = {
      ...source,
      dark: withValue(source.dark, 'color.session.private.gradient-bottom', '#891D98'),
    };
    const [result] = await runChecks(packageRoot, ['gradients'], drifted);
    expect(result?.problems).toHaveLength(1);
    expect(result?.problems[0]).toMatch(
      /^color\.session\.private gradient, dark: #006CCE to #891D98 drifts \d+\.\d° in hue, at most 5°/i,
    );

    // A gradient needs both ends and one owner.
    const resolved = await resolveTokens(source);
    const withoutBottom = resolved.light.filter(
      (token) => token.path !== 'color.accent.gradient-bottom',
    );
    expect(gradientProblems(withoutBottom, 'light')).toEqual([
      'color.accent: a gradient needs both gradient-top and gradient-bottom',
    ]);
    expect(
      gradientProblems(
        [
          { path: 'color.text.gradient-top', value: '#000000' },
          { path: 'color.text.gradient-bottom', value: '#000000' },
        ],
        'light',
      )[0],
    ).toMatch(/belongs to one session type/);
  });

  it('AC6: Open Gym has its tokens and passing contrast pairs, and nothing uses them', async () => {
    const tokens = semanticColours(source).filter((token) =>
      token.startsWith('color.session.open-gym.'),
    );
    expect(tokens.map((token) => token.split('.').at(-1)).sort()).toEqual(
      ['bg', 'fg', 'gradient-bottom', 'gradient-top', 'on-solid', 'solid', 'text'].sort(),
    );
    const pairs = source.pairs.filter(
      (pair) =>
        pair.fg.startsWith('color.session.open-gym.') ||
        pair.bg.startsWith('color.session.open-gym.'),
    );
    expect(pairs.length).toBeGreaterThanOrEqual(6);
    const results = await contrastResults(source);
    for (const pair of pairs) {
      for (const mode of ['light', 'dark']) {
        const result = results.find((r) => r.pair === pair && r.mode === mode);
        expect(result?.passes, `${pair.use} ${mode}`).toBe(true);
      }
    }

    // No screen or kit component references them, in any platform's names.
    const used = /session[-.]open[-.]gym|sessionOpenGym|session_open_gym/;
    const skip = new Set([
      'node_modules',
      '.next',
      'build',
      'DerivedData',
      '.gradle',
      'generated',
      '.turbo',
    ]);
    const roots = ['apps/web', 'packages/ui/src', 'apps/ios', 'apps/android'];
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!skip.has(entry.name)) scan(file);
        } else if (
          /\.(tsx?|css|swift|kt|xml)$/.test(entry.name) &&
          used.test(readFileSync(file, 'utf8'))
        ) {
          offenders.push(path.relative(repoRoot, file));
        }
      }
    };
    for (const root of roots) scan(path.join(repoRoot, root));
    expect(offenders).toEqual([]);
  });
});

describe('E020 v2 contrast pairs', () => {
  let source: TokenSource;
  let values: Values;
  const declared = (fg: string, bg: string) =>
    source.pairs.some((pair) => pair.fg === `color.${fg}` && pair.bg === `color.${bg}`);

  beforeAll(async () => {
    source = await readTokenSource(packageRoot);
    values = await valuesOf(source);
  });

  it('AC3: v2 pairs pass in light and dark', async () => {
    expect(validate(source)).toEqual([]);
    const results = await contrastResults(source);
    expect(results.filter((result) => !result.passes)).toEqual([]);
  });

  it('AC3: white on the accent, accent text, glyphs on fills and glyphs on tints are declared', () => {
    expect(declared('accent.on', 'accent.fill')).toBe(true);
    expect(declared('action.primary.fg', 'action.primary.bg')).toBe(true);
    expect(declared('accent.text', 'bg.canvas')).toBe(true);
    expect(declared('accent.text', 'bg.surface')).toBe(true);
    for (const family of [
      'session.private',
      'session.group',
      'session.open-gym',
      'status.success',
      'status.danger',
      'status.warning',
    ]) {
      // Glyphs on the fill (the colour mixed with black, 85% to 75%) and on the tint (78% with the ink).
      expect(declared(`${family}.on-solid`, `${family}.gradient-top`), `${family} top`).toBe(true);
      expect(declared(`${family}.on-solid`, `${family}.gradient-bottom`), `${family} bottom`).toBe(
        true,
      );
      expect(declared(`${family}.fg`, `${family}.bg`), `${family} tint`).toBe(true);
      expect(declared(`${family}.fg`, 'bg.surface'), `${family} card`).toBe(true);
      expect(declared(`${family}.text`, `${family}.bg`), `${family} label`).toBe(true);
    }
    // The fills are the colour mixed with black, as decided.
    expect(values.light.get('color.session.private.gradient-top')).toBe('#006CCE');
    expect(values.light.get('color.session.private.gradient-bottom')).toBe('#005BAE');
  });

  it('AC3: white text never sits on an unmixed session or status colour', () => {
    for (const mode of ['light', 'dark'] as const) {
      for (const pair of source.pairs) {
        if (values[mode].get(pair.fg) !== '#FFFFFF') continue;
        expect(pair.bg, `${pair.use} (${mode})`).not.toMatch(/\.solid$/);
        // ...and no pair's background has the value of any unmixed `solid` colour.
        for (const [token, value] of values[mode]) {
          if (!token.endsWith('.solid')) continue;
          expect(values[mode].get(pair.bg), `${pair.use} (${mode}) on ${token}`).not.toBe(value);
        }
      }
    }
    // Success never carries white text: only icons, on the mix.
    const successText = source.pairs.filter(
      (pair) =>
        pair.bg.startsWith('color.status.success.') &&
        pair.kind === 'text' &&
        pair.fg.endsWith('on-solid'),
    );
    expect(successText).toEqual([]);
  });

  it('AC3: the native secondary text is the one exception, a pair kind of its own with a floor and a reason', async () => {
    expect(minimumRatio['native-secondary-text']).toBe(3);
    const exception = source.pairs.filter((pair) => pair.kind === 'native-secondary-text');
    expect(exception.length).toBeGreaterThanOrEqual(5);
    for (const pair of exception) {
      expect(pair.fg).toBe('color.text.secondary');
      expect(pair.reason).toContain('ADR-032');
    }
    // No other pair can use it, and nothing else can be a pair of that kind.
    expect(
      source.pairs.filter(
        (pair) => pair.fg === 'color.text.secondary' && pair.kind !== 'native-secondary-text',
      ),
    ).toEqual([]);
    expect(
      validate({
        ...source,
        pairs: [{ fg: 'color.text.secondary', bg: 'color.bg.canvas', kind: 'text', use: 'x' }],
      }),
    ).toEqual([expect.stringMatching(/may only be in native-secondary-text pairs/)]);
    expect(
      validate({
        ...source,
        pairs: [
          {
            fg: 'color.text.primary',
            bg: 'color.bg.canvas',
            kind: 'native-secondary-text',
            use: 'x',
            reason: 'y',
          },
        ],
      }),
    ).toEqual([
      expect.stringMatching(/only color\.text\.secondary may be a native-secondary-text pair/),
    ]);
    expect(
      validate({
        ...source,
        pairs: [
          {
            fg: 'color.text.secondary',
            bg: 'color.bg.canvas',
            kind: 'native-secondary-text',
            use: 'x',
          },
        ],
      }),
    ).toEqual([expect.stringMatching(/needs a reason/)]);

    // It can't drop further than 3:1.
    const lighter = { ...source, light: withValue(source.light, 'color.base.gray.450', '#999999') };
    const failing = (await contrastResults(lighter)).filter((result) => !result.passes);
    expect(failing.length).toBeGreaterThan(0);
    expect(
      failing.every(
        (result) =>
          result.pair.fg === 'color.text.secondary' || result.pair.fg === 'color.border.control',
      ),
    ).toBe(true);
  });

  it('AC3: the exception is for light mode only: dark secondary text needs 4.5:1', async () => {
    // #6A6A70 is 3.17:1 on a card: fine in light mode under the exception, not in dark.
    const dim = { ...source, dark: withValue(source.dark, 'color.text.secondary', '#6A6A70') };
    const failing = (await contrastResults(dim)).filter((result) => !result.passes);
    expect(failing.length).toBeGreaterThan(0);
    for (const result of failing) {
      expect(result.mode).toBe('dark');
      expect(result.pair.kind).toBe('native-secondary-text');
      expect(result.minimum).toBe(4.5);
    }
    const dimLight = {
      ...source,
      light: withValue(source.light, 'color.base.gray.450', '#8A8A90'),
    };
    const light = (await contrastResults(dimLight)).filter(
      (result) => result.pair.kind === 'native-secondary-text' && result.mode === 'light',
    );
    expect(light.every((result) => result.minimum === 3)).toBe(true);
    // ADR-032's dark value passes 4.5:1 everywhere it is declared.
    const dark = (await contrastResults(source)).filter(
      (result) => result.pair.kind === 'native-secondary-text' && result.mode === 'dark',
    );
    expect(dark.length).toBeGreaterThanOrEqual(5);
    expect(dark.every((result) => result.ratio >= 4.5)).toBe(true);
  });

  it('AC3: danger text has text pairs, the Material error role is that text, and onError passes on it', () => {
    for (const bg of [
      'bg.surface',
      'bg.canvas',
      'bg.raised',
      'web.trainer.card',
      'web.trainer.background',
    ]) {
      const pair = source.pairs.find(
        (p) => p.fg === 'color.status.danger.fg' && p.bg === `color.${bg}`,
      );
      expect(pair?.kind, `danger text on ${bg}`).toBe('text');
    }
    expect(
      source.pairs.some(
        (p) =>
          p.fg === 'color.text.inverse' && p.bg === 'color.status.danger.fg' && p.kind === 'text',
      ),
    ).toBe(true);
    // The fill that carries white text stays the 85% mix.
    expect(declared('action.danger.fg', 'action.danger.bg')).toBe(true);
  });

  it.each([
    ['the destructive Button', 'packages/ui/src/components/button.tsx', /destructive:\s*"([^"]+)"/],
    ['the danger pill button', 'packages/ui/src/kit/pill-button.tsx', /danger:\s*'([^']+)'/],
  ])(
    'AC3: %s text keeps 4.5:1 on its own tint and hover tint on every web background',
    (_name, file, pattern) => {
      // The kit's tints, read from the component so the two cannot drift apart.
      const source = readFileSync(path.join(repoRoot, file), 'utf8');
      const variant = source.match(pattern)?.[1] ?? '';
      const percent = (prefix: string) =>
        Number(variant.match(new RegExp(`(?:^|\\s)${prefix}bg-destructive/(\\d+)`))?.[1]);
      const tints = {
        light: [percent(''), percent('hover:')],
        dark: [percent('dark:'), percent('dark:hover:')],
      } as const;
      expect([...tints.light, ...tints.dark].every(Number.isFinite)).toBe(true);

      const backgrounds = {
        light: [
          'web.trainer.background',
          'web.trainer.card',
          'web.trainer.sidebar',
          'web.trainer.muted',
          'bg.canvas',
          'bg.surface',
          'bg.raised',
        ],
        dark: [
          'web.trainer.background',
          'web.trainer.card',
          'web.trainer.sidebar',
          'web.trainer.muted',
          'bg.canvas',
          'bg.surface',
          'bg.raised',
        ],
      } as const;
      for (const mode of ['light', 'dark'] as const) {
        const text = values[mode].get('color.action.danger.text') ?? '';
        for (const bg of backgrounds[mode]) {
          const base = values[mode].get(`color.${bg}`) ?? '';
          for (const amount of tints[mode]) {
            const tint = mix(text, base, amount, 'srgb');
            expect(contrastRatio(text, tint), `${mode} ${bg} ${amount}%`).toBeGreaterThanOrEqual(
              4.5,
            );
          }
        }
      }
    },
  );

  it('AC3: the web exposes the filled danger button and a foreground that reads on --destructive', async () => {
    const outputs = await renderOutputs(source);
    const shadcn = outputs.get(webOutputs.shadcn) ?? '';
    for (const name of ['bg', 'fg', 'text']) {
      expect(shadcn).toContain(`--action-danger-${name}: var(--th-color-action-danger-${name});`);
    }
    for (const colours of [shadcnColours, clientColours]) {
      expect(colours['destructive-foreground']).toBe('color.text.inverse');
      expect(colours.destructive).toBe('color.action.danger.text');
    }
    for (const mode of ['light', 'dark'] as const) {
      expect(
        contrastRatio(
          values[mode].get('color.text.inverse') ?? '',
          values[mode].get('color.action.danger.text') ?? '',
        ),
        mode,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("AC3: the trainer web's pairs are declared, secondary text on the muted fill included", () => {
    expect(declared('web.trainer.muted-foreground', 'web.trainer.muted')).toBe(true);
    expect(declared('web.trainer.foreground', 'web.trainer.background')).toBe(true);
    expect(values.light.get('color.web.trainer.muted-foreground')).toBe('#71717A');
  });

  it('AC3: translucent glass and decorative marks have no contrast pair', () => {
    expect(
      validate({
        ...source,
        pairs: [{ fg: 'color.text.primary', bg: 'color.web.glass.bg', kind: 'text', use: 'x' }],
      }),
    ).toEqual([expect.stringMatching(/translucent or decorative/)]);
    expect(
      validate({
        ...source,
        pairs: [
          { fg: 'color.fill.decorative', bg: 'color.bg.surface', kind: 'non-text', use: 'x' },
        ],
      }),
    ).toEqual([expect.stringMatching(/translucent or decorative/)]);
  });
});

describe('E020 workspace colours', () => {
  let source: TokenSource;

  beforeAll(async () => {
    source = await readTokenSource(packageRoot);
  });

  it('the colours are tokens, each with a declared pair on cards and the canvas', () => {
    const tokens = semanticColours(source)
      .filter((token) => token.startsWith('color.workspace.'))
      .map((token) => token.replace('color.workspace.', ''));
    expect(tokens).toEqual([...workspaceColours]);
    for (const name of tokens) {
      for (const bg of ['bg.surface', 'bg.canvas']) {
        expect(
          source.pairs.some(
            (pair) =>
              pair.fg === `color.workspace.${name}` &&
              pair.bg === `color.${bg}` &&
              pair.kind === 'non-text',
          ),
          `${name} on ${bg}`,
        ).toBe(true);
      }
    }
  });

  it('is picked from the workspace ID, the same on every platform', async () => {
    // FNV-1a over UTF-8 bytes; the Swift version of the same loop gives the same numbers.
    const vectors: [string, number, string][] = [
      ['', 2166136261, 'brown'],
      ['a', 3826002220, 'slate'],
      ['0190a5f0-7c3e-7a52-9d27-3f6b1c2e4a10', 4140889926, 'cyan'],
      ["John's Gym", 3042376973, 'lime'],
      ['Café Zuid ✓', 3893894864, 'indigo'],
    ];
    for (const [id, hash, colour] of vectors) {
      expect(fnv1a(id), id).toBe(hash);
      expect(workspaceColour(id), id).toBe(colour);
    }

    const outputs = await renderOutputs(source);
    const swift = outputs.get(swiftOutputs.colors) ?? '';
    const kotlin = outputs.get(kotlinOutputs.colors) ?? '';
    expect(swift).toContain('var hash: UInt32 = 2166136261');
    expect(swift).toContain('(hash ^ UInt32(byte)) &* 16777619');
    expect(kotlin).toContain('var hash = 2166136261u');
    expect(kotlin).toContain('(hash xor byte.toUByte().toUInt()) * 16777619u');
    const names = (code: string) =>
      [...code.matchAll(/workspace(Cyan|Brown|Indigo|Gold|Slate|Lime)[,\n]/g)].map(([, name]) =>
        name?.toLowerCase(),
      );
    expect(names(swift.split('static func workspaceColor')[1] ?? '')).toEqual([
      ...workspaceColours,
    ]);
    expect(names(kotlin.split('fun TokenColors.workspaceColor')[1] ?? '')).toEqual([
      ...workspaceColours,
    ]);
  });

  it('uses every colour', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(workspaceColour(`workspace-${i}`));
    expect(seen.size).toBe(workspaceColours.length);
  });
});

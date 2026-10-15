import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The raw-colour guard (E007 AC8): web source colours only through the design tokens (shadcn's
 * theme classes and variables), so every colour follows light and dark mode and the token
 * package's contrast checks. See README.md, "Raw-colour guard".
 */

/** The web source the guard scans, relative to the repo root. */
export const scope = ['apps/web', 'packages/ui'] as const;

/**
 * Where the shadcn CLI writes components (`components.json`'s `ui` alias, resolved through
 * `tsconfig.json`'s paths). They are upstream code that we never edit, and upstream uses arbitrary
 * colours (the secondary `Button`'s `hover:bg-[color-mix(…)]`), so the guard leaves them alone.
 */
export const vendoredComponents = 'packages/ui/src/components';

const sourceExtensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
]);
// Tests assert on colours (e.g. the computed `rgb()` of a token) rather than paint with them.
const testFile = /\.(test|spec)\.[cm]?[jt]sx?$/;
// Directories at the top of a package (`apps/web/e2e`) that hold tests or build output, not source.
const skippedPackageDirs = new Set([
  'test',
  'e2e',
  'dist',
  'build',
  'out',
  'coverage',
  'playwright-report',
  'test-results',
  'blob-report',
]);

const hex = /(?<![\w&#])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})(?![\w-])/gi;
const colourFunction =
  /(?<![\w-])(?:(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|color\(\s*(?:srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)\b)[^)\n]*\)?/gi;
const colourMix = /(?<![\w-])color-mix\(/i;
// A Tailwind class with an arbitrary value: `bg-[#fff]`, `hover:bg-[color-mix(…)]`.
const arbitraryValue = /(?<![\w-])[a-z][\w-]*-\[([^\]\s]+)\]/gi;
// CSS named colours (CSS Color Module Level 4), for arbitrary values such as `bg-[red]`.
const namedColours = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet
  brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue
  darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
  darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise
  darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia
  gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo
  ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue
  lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon
  mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
  mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
  paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
  rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
  slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen`.split(/\s+/),
);

export type RawColour = { file: string; line: number; column: number; value: string };

function isColourValue(value: string): boolean {
  return (
    value.search(hex) >= 0 ||
    value.search(colourFunction) >= 0 ||
    colourMix.test(value) ||
    namedColours.has(value.replace(/^color:/i, '').toLowerCase())
  );
}

/** The text with its comments replaced by spaces, so offsets and lines stay the same. */
function withoutComments(file: string, text: string): string {
  const chars = text.split('');
  for (const [start, end] of commentRanges(text, path.extname(file) === '.css')) {
    for (let i = start; i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

// Not `<`: in TSX, `</p>` closes a tag.
const regexPrecedingChars = new Set('(,=:[!&|?{};+-*%>~^');
const regexPrecedingWords = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

/** Whether the `/` at `slash` starts a regex literal rather than a division. */
function startsRegex(text: string, slash: number): boolean {
  const before = text.slice(0, slash).trimEnd();
  const last = before.at(-1);
  if (last === undefined || regexPrecedingChars.has(last)) return true;
  return regexPrecedingWords.has(/[\w$]+$/.exec(before)?.[0] ?? '');
}

/**
 * Where the comments are, as [start, end) offsets. A small lexer: it skips strings, template
 * literals and regex literals, so `//` in a URL or `/*` in a glob doesn't start a comment. CSS has
 * only block comments and strings.
 */
function commentRanges(text: string, css: boolean): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  // The brace depth at each open template `${`, so its `}` resumes the template.
  const templates: number[] = [];
  let braces = 0;

  const quoted = (from: number) => {
    let i = from + 1;
    while (i < text.length && text[i] !== text[from] && text[i] !== '\n') {
      i += text[i] === '\\' ? 2 : 1;
    }
    return i + 1;
  };
  const template = (from: number) => {
    let i = from;
    while (i < text.length) {
      if (text[i] === '\\') i += 2;
      else if (text[i] === '`') return i + 1;
      else if (text[i] === '$' && text[i + 1] === '{') {
        templates.push(braces);
        return i + 2;
      } else i++;
    }
    return i;
  };
  const regex = (from: number) => {
    let i = from + 1;
    let inClass = false;
    while (i < text.length && text[i] !== '\n' && (inClass || text[i] !== '/')) {
      if (text[i] === '[') inClass = true;
      else if (text[i] === ']') inClass = false;
      i += text[i] === '\\' ? 2 : 1;
    }
    return i + 1;
  };

  let i = 0;
  while (i < text.length) {
    const pair = text.slice(i, i + 2);
    const char = text[i];
    if (pair === '/*' || (!css && pair === '//')) {
      const close = pair === '/*' ? text.indexOf('*/', i + 2) : text.indexOf('\n', i);
      const end = close < 0 ? text.length : close + (pair === '/*' ? 2 : 0);
      ranges.push([i, end]);
      i = end;
    } else if (char === '"' || char === "'") i = quoted(i);
    else if (css) i++;
    else if (char === '`') i = template(i + 1);
    else if (char === '{') {
      braces++;
      i++;
    } else if (char === '}' && templates.at(-1) === braces) {
      templates.pop();
      i = template(i + 1);
    } else if (char === '}') {
      braces--;
      i++;
    } else if (char === '/' && startsRegex(text, i)) i = regex(i);
    else i++;
  }
  return ranges;
}

/** The raw colours in one source file: colour literals and arbitrary Tailwind colour values. */
export function findRawColours(file: string, text: string): RawColour[] {
  const code = withoutComments(file, text);
  const found: Array<{ index: number; value: string }> = [];
  const classSpans: Array<{ start: number; end: number }> = [];

  for (const match of code.matchAll(arbitraryValue)) {
    if (!isColourValue(match[1] ?? '')) continue;
    found.push({ index: match.index, value: match[0] });
    classSpans.push({ start: match.index, end: match.index + match[0].length });
  }
  for (const pattern of [hex, colourFunction]) {
    for (const match of code.matchAll(pattern)) {
      if (classSpans.some(({ start, end }) => match.index >= start && match.index < end)) continue;
      found.push({ index: match.index, value: match[0] });
    }
  }

  return found
    .sort((a, b) => a.index - b.index)
    .map(({ index, value }) => {
      const before = code.slice(0, index);
      return {
        file,
        line: before.split('\n').length,
        column: index - before.lastIndexOf('\n'),
        value,
      };
    });
}

async function sourceFiles(root: string, dir: string): Promise<string[]> {
  const files: string[] = [];
  const isPackageRoot = (scope as readonly string[]).includes(dir);
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (isPackageRoot && skippedPackageDirs.has(entry.name)) continue;
      if (relative === vendoredComponents) continue;
      files.push(...(await sourceFiles(root, relative)));
    } else if (sourceExtensions.has(path.extname(entry.name)) && !testFile.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

/** Scans the web source under `root`, the repo root. */
export async function checkRawColours(
  root: string,
): Promise<{ files: number; rawColours: RawColour[] }> {
  const files = (await Promise.all(scope.map((dir) => sourceFiles(root, dir)))).flat().sort();
  const rawColours: RawColour[] = [];
  for (const file of files) {
    rawColours.push(...findRawColours(file, await readFile(path.join(root, file), 'utf8')));
  }
  return { files: files.length, rawColours };
}

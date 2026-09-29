import { type MessageFormatElement, parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { formattingLocales, type Locale } from '../config.ts';

/**
 * A message in the subset of ICU that maps to iOS String Catalogs and Android
 * resources: text, `{name}` placeholders and at most one top-level cardinal plural
 * whose branches use `#`. Anything else is rejected, so the exporters never guess
 * (ADR-008: "the exporter fails loudly on constructs it can't convert").
 */
export type Part =
  | { type: 'text'; value: string }
  | { type: 'arg'; name: string }
  /** `#` inside a plural branch: the plural count. */
  | { type: 'count' };

export type PluralCategory = Intl.LDMLPluralRule;

export type Body =
  | { kind: 'simple'; parts: Part[] }
  | {
      kind: 'plural';
      arg: string;
      before: Part[];
      branches: Partial<Record<PluralCategory, Part[]>>;
      after: Part[];
    };

export type ArgType = 'string' | 'integer';

export interface CompiledMessage {
  body: Body;
  /**
   * Arguments sorted by name. The position in this list is the 1-based positional
   * index in native format strings (`%1$@`, `%2$s`), so rewording a translation never
   * reorders a call site's arguments. Plural counts are integers, the rest strings.
   */
  args: { name: string; type: ArgType }[];
}

export type CompileResult =
  | { ok: true; message: CompiledMessage }
  | { ok: false; errors: string[] };

const UNSUPPORTED: Partial<Record<TYPE, string>> = {
  [TYPE.number]:
    'number formatting ({n, number}) is not supported; format the number in code and pass it as a plain {placeholder} (GLOSSARY.md §3.1)',
  [TYPE.date]:
    'date formatting ({d, date}) is not supported; format the date in code with dateTimeFormats and pass it as a plain {placeholder} (GLOSSARY.md §3.1)',
  [TYPE.time]:
    'time formatting ({t, time}) is not supported; format the time in code with dateTimeFormats and pass it as a plain {placeholder} (GLOSSARY.md §3.1)',
  [TYPE.select]:
    'select is not supported by the native exporters; use a separate key per case and choose in code',
  [TYPE.tag]:
    'rich-text tags (<b>…</b>) are not supported by the native exporters; split the message or style it in code',
};

export function pluralCategories(locale: Locale): PluralCategory[] {
  return new Intl.PluralRules(formattingLocales[locale]).resolvedOptions().pluralCategories;
}

export function compileMessage(source: string, locale: Locale): CompileResult {
  let ast: MessageFormatElement[];
  try {
    ast = parse(source, { requiresOtherClause: true, shouldParseSkeletons: false });
  } catch (error) {
    const detail = error as { message?: string; location?: { start: { offset: number } } };
    const at = detail.location ? ` at offset ${detail.location.start.offset}` : '';
    return { ok: false, errors: [`invalid ICU syntax: ${detail.message ?? String(error)}${at}`] };
  }

  const errors: string[] = [];
  const categories = pluralCategories(locale);
  let plural: Extract<Body, { kind: 'plural' }> | undefined;
  const before: Part[] = [];
  const after: Part[] = [];

  for (const element of ast) {
    const target = plural ? after : before;
    if (element.type === TYPE.plural) {
      if (plural) {
        errors.push('only one plural per message is supported; split the message into two keys');
        continue;
      }
      if (element.pluralType === 'ordinal') {
        errors.push('selectordinal is not supported by the native exporters');
        continue;
      }
      if (element.offset !== 0) {
        errors.push('plural offset is not supported by the native exporters');
        continue;
      }
      const branches: Partial<Record<PluralCategory, Part[]>> = {};
      for (const [selector, option] of Object.entries(element.options)) {
        if (selector.startsWith('=')) {
          errors.push(
            `exact plural selector "${selector}" is not supported: Android ignores it for nl and en; use a separate key (e.g. for zero) and choose in code`,
          );
          continue;
        }
        if (!(categories as string[]).includes(selector)) {
          errors.push(
            `plural category "${selector}" does not exist in ${locale} (expected: ${categories.join(', ')})`,
          );
          continue;
        }
        branches[selector as PluralCategory] = convertBranch(option.value, errors);
      }
      for (const category of categories) {
        if (!(category in element.options)) {
          errors.push(`plural is missing the "${category}" branch required for ${locale}`);
        }
      }
      plural = { kind: 'plural', arg: element.value, before, branches, after };
    } else {
      convertElement(element, target, errors, false);
    }
  }

  if (errors.length > 0) return { ok: false, errors: unique(errors) };

  const body: Body = plural ?? { kind: 'simple', parts: before };
  return {
    ok: true,
    message: { body: normalize(body), args: collectArgs(body) },
  };
}

function convertBranch(elements: MessageFormatElement[], errors: string[]): Part[] {
  const parts: Part[] = [];
  for (const element of elements) {
    if (element.type === TYPE.plural) {
      errors.push('nested plurals are not supported; split the message into separate keys');
    } else {
      convertElement(element, parts, errors, true);
    }
  }
  return parts;
}

function convertElement(
  element: MessageFormatElement,
  parts: Part[],
  errors: string[],
  inPlural: boolean,
): void {
  switch (element.type) {
    case TYPE.literal:
      parts.push({ type: 'text', value: element.value });
      return;
    case TYPE.argument:
      parts.push({ type: 'arg', name: element.value });
      return;
    case TYPE.pound:
      // The parser only emits `#` inside a plural; outside it is literal text.
      parts.push(inPlural ? { type: 'count' } : { type: 'text', value: '#' });
      return;
    default:
      errors.push(UNSUPPORTED[element.type] ?? `unsupported ICU element (type ${element.type})`);
  }
}

function collectArgs(body: Body): CompiledMessage['args'] {
  const types = new Map<string, ArgType>();
  const visit = (parts: Part[]) => {
    for (const part of parts) {
      if (part.type === 'arg' && !types.has(part.name)) types.set(part.name, 'string');
    }
  };
  if (body.kind === 'simple') {
    visit(body.parts);
  } else {
    types.set(body.arg, 'integer');
    visit(body.before);
    for (const parts of Object.values(body.branches)) visit(parts);
    visit(body.after);
  }
  return [...types]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, type]) => ({ name, type }));
}

/** Merges adjacent text parts, so exporters see one text run between placeholders. */
function mergeText(parts: Part[]): Part[] {
  const merged: Part[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (part.type === 'text' && last?.type === 'text') {
      merged[merged.length - 1] = { type: 'text', value: last.value + part.value };
    } else if (part.type !== 'text' || part.value !== '') {
      merged.push(part);
    }
  }
  return merged;
}

function normalize(body: Body): Body {
  if (body.kind === 'simple') return { kind: 'simple', parts: mergeText(body.parts) };
  const branches: Partial<Record<PluralCategory, Part[]>> = {};
  for (const [category, parts] of Object.entries(body.branches)) {
    branches[category as PluralCategory] = mergeText(parts);
  }
  return {
    ...body,
    before: mergeText(body.before),
    branches,
    after: mergeText(body.after),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Every argument's positional index (1-based) in native format strings. */
export function argIndex(message: CompiledMessage, name: string): number {
  const index = message.args.findIndex((arg) => arg.name === name);
  if (index === -1) throw new Error(`unknown argument "${name}"`);
  return index + 1;
}

export function hasArgs(message: CompiledMessage): boolean {
  return message.args.length > 0;
}

#!/usr/bin/env node
// The runbooks and the restore-drill log link to each other and to the engineering docs by section (E016 #1041, AC7).
// A link to a file that doesn't exist already fails the doc links check of scripts/check.sh for every Markdown file.
// This is its stricter half for these documents: a link to a section (`file.md#section`, or `#section` in the same
// file) also fails when that heading doesn't exist, so a renamed heading can't leave a runbook step pointing nowhere
// while someone is working through an incident.
//
//   node scripts/doc-anchors.mjs [dir]   check the runbooks and the drill log in dir (default: this checkout);
//                                        scripts/check.sh runs it. Prints one line per broken link, exits 1 on any.
//
// The documents are the paths in DOCS. A document that doesn't exist yet is not an error: there is nothing to check
// until the ticket that writes it lands.
//
// Anchors follow GitHub's rules: the heading text without its inline Markdown, lower case, spaces to hyphens, every
// other punctuation mark dropped, and a heading that repeats gets `-1`, `-2`, ... A heading in a code fence is not a
// heading. A fragment is compared lower case and percent-decoded. A fragment on a file that is not Markdown is not checked.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DOCS = ['docs/engineering/RUNBOOKS.md', 'docs/engineering/restore-drills.md'];

/** The text with its fenced code blocks (``` or ~~~) blanked out, line for line. */
const withoutFences = (text) => {
  let fence = null;
  return text
    .split('\n')
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence) {
        if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
        return '';
      }
      if (marker) {
        fence = marker;
        return '';
      }
      return line;
    })
    .join('\n');
};

/** GitHub's anchor for the text of a heading. */
export const anchorOf = (heading) =>
  heading
    .replace(/\s+#+\s*$/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}_\- ]/gu, '')
    .replace(/ /g, '-');

/** The anchors of the headings of a Markdown text, in order, repeats numbered like GitHub does. */
export const anchorsOf = (text) => {
  const seen = new Map();
  const anchors = [];
  for (const line of withoutFences(text).split('\n')) {
    const heading = /^ {0,3}#{1,6}[ \t]+(.*?)[ \t]*$/.exec(line)?.[1];
    if (heading === undefined) continue;
    const base = anchorOf(heading);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.push(count === 0 ? base : `${base}-${count}`);
  }
  return new Set(anchors);
};

/** The link targets of a Markdown text that point at a file or a section: no URLs, no `<...>` targets. */
const linkTargets = (text) =>
  [
    ...withoutFences(text)
      .replace(/`[^`\n]*`/g, '')
      .matchAll(/\]\(([^)\s]+)\)/g),
  ]
    .map((match) => match[1])
    .filter((target) => !/^[a-z][a-z0-9+.-]*:|^</i.test(target));

const decode = (fragment) => {
  try {
    return decodeURIComponent(fragment).toLowerCase();
  } catch {
    return fragment.toLowerCase();
  }
};

/** One line per broken link of the runbooks and the drill log in `dir`. */
export const checkDocAnchors = (dir = join(import.meta.dirname, '..')) => {
  const problems = [];
  for (const doc of DOCS) {
    const path = join(dir, doc);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const target of linkTargets(text)) {
      const hash = target.indexOf('#');
      const file = hash === -1 ? target : target.slice(0, hash);
      const fragment = hash === -1 ? '' : target.slice(hash + 1);
      const resolved = file === '' ? path : join(dirname(path), decodeURI(file));
      if (!existsSync(resolved)) {
        problems.push(`${doc}: broken link ${target}`);
        continue;
      }
      if (fragment === '' || !resolved.endsWith('.md') || !statSync(resolved).isFile()) continue;
      const anchors = anchorsOf(file === '' ? text : readFileSync(resolved, 'utf8'));
      if (!anchors.has(decode(fragment))) problems.push(`${doc}: broken link ${target}`);
    }
  }
  return problems;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = checkDocAnchors(process.argv[2]);
  for (const problem of problems) console.log(problem);
  process.exit(problems.length === 0 ? 0 : 1);
}

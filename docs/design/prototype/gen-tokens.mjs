#!/usr/bin/env node
// Prototype helper, not the real pipeline: E007 (M1) replaces this with Style Dictionary.
// Reads ../tokens.draft.json, writes tokens.css for the prototype, and checks WCAG contrast.
//
//   node docs/design/prototype/gen-tokens.mjs           # write tokens.css
//   node docs/design/prototype/gen-tokens.mjs --check   # print the contrast table (exits 1 on a failure)
//
// No dependencies, so the prototype stays no-build: tokens.css is committed.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "..", "tokens.draft.json");
const tokens = JSON.parse(readFileSync(source, "utf8"));
const MODE_KEY = "app.trainerhub.mode";

// Collect every token (an object with $value) under its dotted path.
const flat = new Map();
(function walk(node, path) {
  if (node && typeof node === "object" && "$value" in node) {
    flat.set(path.join("."), node);
    return;
  }
  for (const [key, child] of Object.entries(node ?? {})) {
    if (!key.startsWith("$")) walk(child, [...path, key]);
  }
})(tokens, []);

function resolve(value, mode) {
  if (typeof value === "string" && /^\{.+\}$/.test(value)) {
    const target = flat.get(value.slice(1, -1));
    if (!target) throw new Error(`Unknown reference ${value}`);
    return resolve(valueFor(target, mode), mode);
  }
  return value;
}

function valueFor(token, mode) {
  const dark = token.$extensions?.[MODE_KEY]?.dark;
  return mode === "dark" && dark ? dark : token.$value;
}

const cssName = (path) => `--${path.replace(/\./g, "-")}`;

function cssValue(path, token, mode) {
  const value = resolve(valueFor(token, mode), mode);
  if (Array.isArray(value) && path.startsWith("font.family")) {
    return value.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ");
  }
  if (Array.isArray(value)) return `cubic-bezier(${value.join(", ")})`;
  return String(value);
}

// ---- tokens.css -------------------------------------------------------------
if (!process.argv.includes("--check")) {
  const light = [];
  const dark = [];
  for (const [path, token] of flat) {
    if (path.startsWith("color.base.")) continue; // components only see semantic colours
    if (typeof token.$value === "object" && !Array.isArray(token.$value)) {
      // typography composite → one variable per property
      for (const [prop, raw] of Object.entries(token.$value)) {
        const v = resolve(raw, "light");
        const out = Array.isArray(v) ? v.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ") : v;
        light.push(`  ${cssName(path)}-${prop.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}: ${out};`);
      }
      continue;
    }
    light.push(`  ${cssName(path)}: ${cssValue(path, token, "light")};`);
    if (token.$extensions?.[MODE_KEY]?.dark) dark.push(`  ${cssName(path)}: ${cssValue(path, token, "dark")};`);
  }
  const css = `/* GENERATED from docs/design/tokens.draft.json by gen-tokens.mjs. Do not edit by hand. */
:root {
${light.join("\n")}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${dark.map((l) => "  " + l).join("\n")}
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
${dark.join("\n")}
}
`;
  writeFileSync(join(here, "tokens.css"), css);
  console.log(`tokens.css written (${light.length} tokens, ${dark.length} dark overrides)`);
  process.exit(0);
}

// ---- contrast check ------------------------------------------------------------
function luminance(hex) {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [foreground, background, minimum, what it is]
const pairs = [
  ["color.text.primary", "color.bg.canvas", 4.5, "Body text on page"],
  ["color.text.primary", "color.bg.surface", 4.5, "Body text on card"],
  ["color.text.secondary", "color.bg.canvas", 4.5, "Meta text on page"],
  ["color.text.secondary", "color.bg.surface", 4.5, "Meta text on card"],
  ["color.text.secondary", "color.bg.subtle", 4.5, "Meta text on subtle fill"],
  ["color.text.tertiary", "color.bg.surface", 4.5, "Placeholder in input"],
  ["color.text.link", "color.bg.surface", 4.5, "Link / text button"],
  ["color.text.inverse", "color.bg.inverse", 4.5, "Toast text"],
  ["color.action.primary.fg", "color.action.primary.bg", 4.5, "Primary button label"],
  ["color.action.primary.bg", "color.bg.canvas", 3, "Primary button edge vs page (1.4.11)"],
  ["color.action.tonal.fg", "color.action.tonal.bg", 4.5, "Tonal button / selected chip"],
  ["color.action.danger.fg", "color.action.danger.bg", 4.5, "Destructive button label"],
  ["color.border.control", "color.bg.surface", 3, "Input outline (1.4.11)"],
  ["color.border.control", "color.bg.raised", 3, "Input outline in a sheet"],
  ["color.text.secondary", "color.bg.raised", 4.5, "Meta text in a sheet"],
  ["color.border.focus", "color.bg.canvas", 3, "Focus ring (2.4.13)"],
  ["color.status.success.fg", "color.status.success.bg", 4.5, "Aanwezig chip"],
  ["color.status.warning.fg", "color.status.warning.bg", 4.5, "Warning chip"],
  ["color.status.danger.fg", "color.status.danger.bg", 4.5, "Niet verschenen / error chip"],
  ["color.status.danger.fg", "color.bg.surface", 4.5, "Field error message"],
  ["color.status.neutral.fg", "color.status.neutral.bg", 4.5, "Geboekt chip"],
  ["color.session.private.fg", "color.session.private.bg", 4.5, "Privé label"],
  ["color.session.group.fg", "color.session.group.bg", 4.5, "Groepsles label"],
  ["color.session.open-gym.fg", "color.session.open-gym.bg", 4.5, "Open Gym label"],
  ["color.session.private.solid", "color.bg.surface", 3, "Privé bar in calendar"],
  ["color.session.group.solid", "color.bg.surface", 3, "Groepsles bar in calendar"],
  ["color.session.open-gym.solid", "color.bg.surface", 3, "Open Gym bar in calendar"],
];

let failed = 0;
console.log("| Pair | Use | Min | Light | Dark |");
console.log("|---|---|---|---|---|");
for (const [fg, bg, min, use] of pairs) {
  const cells = ["light", "dark"].map((mode) => {
    const r = ratio(resolve(valueFor(flat.get(fg), mode), mode), resolve(valueFor(flat.get(bg), mode), mode));
    if (r < min) failed++;
    return `${r.toFixed(2)}${r < min ? " ❌" : " ✓"}`;
  });
  const short = (p) => p.replace("color.", "");
  console.log(`| \`${short(fg)}\` on \`${short(bg)}\` | ${use} | ${min}:1 | ${cells[0]} | ${cells[1]} |`);
}
if (failed) {
  console.error(`\n${failed} pair(s) below the minimum`);
  process.exit(1);
}

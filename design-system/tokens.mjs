// Read the live design tokens out of app/globals.css.
//
// The previews used to hand-copy these, with a README claiming they were
// "lifted verbatim". They were not, and they rotted: the bundle still showed
// brass, Manrope and the five category hues weeks after all three were
// retired. Parsing the real stylesheet is what makes that class of drift
// impossible rather than merely discouraged.
//
// Deliberately a small regex reader, not a CSS parser: it only needs the
// `--name: value;` declarations out of a handful of top-level blocks, and a
// real parser is a dependency plus a build step for no extra correctness here.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CSS = join(dirname(fileURLToPath(import.meta.url)), "..", "app", "globals.css");

/** Every `--custom-property: value;` inside one top-level `selector { ... }`. */
function blocks(css, selector) {
  const out = [];
  // Top-level blocks only: the selector must start a line, and the block ends
  // at the first line that is exactly `}`.
  const re = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{$`, "gm");
  let m;
  while ((m = re.exec(css))) {
    const end = css.indexOf("\n}", m.index);
    if (end === -1) continue;
    out.push(css.slice(m.index, end));
  }
  return out;
}

function declarations(text) {
  const vars = {};
  // Strip comments first so a commented-out token never leaks in.
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, name, value] of clean.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    vars[name] = value.trim();
  }
  return vars;
}

export async function readTokens() {
  const css = await readFile(CSS, "utf8");

  // Day: @theme plus the plain :root blocks (durations, radii, the over-photo
  // set, the shadcn bridge). @theme inline is skipped — it only re-exports.
  const day = {};
  for (const b of blocks(css, "@theme")) Object.assign(day, declarations(b));
  for (const b of blocks(css, ":root")) Object.assign(day, declarations(b));

  // Night overrides.
  const night = {};
  // Exact `[data-theme="night"] {` only. The anchored `\\s*\\{$` is what keeps
  // the 40-odd `[data-theme="night"] .some-component {` rules further down the
  // file out of the token set.
  for (const b of blocks(css, '[data-theme="night"]')) {
    Object.assign(night, declarations(b));
  }

  if (!day["--color-paper"] || !night["--color-paper"]) {
    throw new Error("token read failed — globals.css structure changed, fix tokens.mjs");
  }
  return { day, night };
}

/** Emit the two palettes as CSS the previews can drop straight in. */
export function tokenCss({ day, night }) {
  const decl = (vars) =>
    Object.entries(vars)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join("\n");
  return `:root {\n${decl(day)}\n}\n[data-theme="night"] {\n${decl(night)}\n}\n`;
}

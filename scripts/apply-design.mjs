#!/usr/bin/env node
// The design system's one source, compiled: `npm run apply-design` reads
// design/system.yaml and writes styles/theme.css (the tokens Tailwind turns
// into classes, with its own palette, shadows and radii switched off) and
// DESIGN.md (the readable contract, which the lint reads for "## Declared")
// and src/fonts.ts (the Google Fonts stylesheet the layout loads for the
// record's families). All three are generated; `npm run check` fails when one
// no longer matches the record, so a change is made in the record and nowhere
// else.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { fail } from "../src/data/cli.mjs";
import { start } from "./lib.mjs";

export const RECORD = "design/system.yaml";
export const THEME = "styles/theme.css";
export const DESIGN = "DESIGN.md";
export const FONTS = "src/fonts.ts";

// Families the browser already has, never fetched from Google Fonts.
const SYSTEM_FONTS = /^(ui-|system-ui|-apple-system|blinkmacsystemfont|segoe ui|sf pro|georgia|arial|helvetica|times|times new roman|verdana|tahoma|trebuchet ms|courier new|sans-serif|serif|monospace)/i;

// token group in the record → the CSS variable prefix Tailwind reads
const PREFIX = { colors: "color", typography: "text", rounded: "radius", shadows: "shadow", spacing: "spacing", containers: "container", easing: "ease" };
// Tailwind resolves max-w-<name> against --spacing-* first, so a spacing step
// named like a size silently changes every max-w-xl on the site.
const SIZE_NAMES = /^(3xs|2xs|xs|sm|md|lg|xl|[2-7]xl|prose|full|screen)$/;
// and one named like a display value becomes a size too: a step called
// "block" makes every inline-block also set inline-size
const DISPLAY_NAMES = /^(block|flex|grid|table|contents|flow-root|list-item|hidden)$/;
const IDENTITY = { subject: "Subject", audience: "Audience", one_job: "One job", direction: "Direction", source: "Source", signature: "Signature", rejection: "Rejection", photography: "Photography" };
const SECTIONS = [
  ["overview", "Visual Theme & Atmosphere"], ["colors", "Color Palette & Roles"], ["typography", "Typography Rules"],
  ["components", "Component Stylings"], ["layout", "Layout Principles"], ["elevation_and_depth", "Depth & Elevation"],
  ["motion", "Motion"], ["responsive_behavior", "Responsive Behavior"], ["dos_and_donts", "Do's and Don'ts"], ["known_gaps", "Known Gaps"],
];
const EXTENSIONS = ["x_invariants", "x_imagery", "x_emphasis", "x_motion", "x_layout"];
const REF = /\{([a-z_]+)\.([a-z0-9-]+)\}/g;

/** The record, or exit 1 naming the YAML mistake, never a stack trace. */
export function readRecord(file = RECORD) {
  try {
    return YAML.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`${file} is not valid YAML: ${String(e.message).split("\n")[0].replace(/:$/, "")}`, `fix ${file} at that line, then npm run apply-design`);
  }
}

/** Everything wrong with a record, as sentences; empty when it compiles. */
export function problems(rec) {
  const out = [];
  const t = rec.tokens ?? {};
  for (const group of ["colors", "typography"]) if (!t[group]) out.push(`tokens.${group} is missing`);
  for (const style of ["display", "copy"]) if (!t.typography?.[style]?.fontFamily) out.push(`tokens.typography.${style} needs a fontFamily (it sets font-${style === "copy" ? "body" : "display"})`);
  for (const group of Object.keys(t)) if (!PREFIX[group]) out.push(`tokens.${group} is not a token group (${Object.keys(PREFIX).join(", ")})`);
  for (const k of Object.keys(t.spacing ?? {})) if (SIZE_NAMES.test(k)) out.push(`tokens.spacing.${k}: a size name would hijack max-w-${k}; name it for what it spaces`);
  for (const k of Object.keys(t.spacing ?? {})) if (DISPLAY_NAMES.test(k)) out.push(`tokens.spacing.${k}: a display name would give inline-${k} a width; name it for what it spaces`);
  for (const [, group, name] of YAML.stringify(rec).matchAll(REF)) {
    if (!t[group]?.[name]) out.push(`{${group}.${name}} refers to a token the record does not define`);
  }
  for (const id of rec.x_declares ?? []) if (!rec.x_declares_reasons?.[id]) out.push(`x_declares names ${id} without a reason in x_declares_reasons`);
  for (const side of ["do", "dont"]) for (const r of rec.sections?.dos_and_donts?.[side] ?? []) if (!r.why) out.push(`dos_and_donts.${side}: "${r.rule}" has no why`);
  if (out.length) return [...new Set(out)];
  // what the base stylesheet reads must exist
  const css = themeCss(rec);
  for (const [, v] of readFileSync("styles/input.css", "utf8").matchAll(/var\((--[a-z0-9-]+)\)/g)) {
    if (!css.includes(`${v}:`)) out.push(`styles/input.css reads ${v}, which the record does not produce`);
  }
  return [...new Set(out)];
}

const cssValue = (v) => String(v).replace(REF, (_, g, n) => `var(--${PREFIX[g]}-${n})`);
const stack = (family) => (family.includes(",") ? family : `"${family.replace(/"/g, "")}", ui-sans-serif, system-ui, sans-serif`);

/** The families by the font-* name each is used as: display and body (the same family may be both), then any other by its first style. */
function families(typography) {
  const out = [["display", typography.display.fontFamily], ["body", typography.copy.fontFamily]];
  const seen = new Set(out.map(([, f]) => f));
  for (const [style, v] of Object.entries(typography)) if (v.fontFamily && !seen.has(v.fontFamily)) seen.add(v.fontFamily), out.push([style, v.fontFamily]);
  return out;
}

export function themeCss(rec) {
  const t = rec.tokens;
  const L = [
    `/* Generated by \`npm run apply-design\` from ${RECORD}: change the record, not this file.`,
    `   Every --color-* becomes bg-/text-/border- classes, every --font-* a font- class,`,
    `   every --text-* a size with its line height, tracking and weight. Tailwind's own`,
    `   palette, shadows, radii, blurs and animations are switched off, so only these exist. */`,
    ``,
    `@theme {`,
    ...["--color-*", "--shadow-*", "--inset-shadow-*", "--drop-shadow-*", "--radius-*", "--blur-*", "--animate-*"].map((n) => `  ${n}: initial;`),
  ];
  const block = (comment, rows) => rows.length && L.push(``, `  /* ${comment} */`, ...rows.map(([k, v]) => `  ${k}: ${v};`));
  block("colours, by role", Object.entries(t.colors).map(([k, v]) => [`--color-${k}`, cssValue(v)]));
  block("families", families(t.typography).map(([name, family]) => [`--font-${name}`, stack(family)]));
  block("type", Object.entries(t.typography).flatMap(([k, v]) => [
    [`--text-${k}`, v.fontSize],
    ...[["lineHeight", "line-height"], ["letterSpacing", "letter-spacing"], ["fontWeight", "font-weight"]]
      .filter(([f]) => v[f] != null).map(([f, css]) => [`--text-${k}--${css}`, v[f]]),
  ]));
  for (const group of ["rounded", "shadows", "spacing", "containers", "easing"]) {
    block(group, Object.entries(t[group] ?? {}).map(([k, v]) => [`--${PREFIX[group]}-${k}`, cssValue(v)]));
  }
  L.push(`}`, ``);
  return L.join("\n");
}

// A reference in prose reads as the class or value it stands for.
function prose(text, t) {
  return String(text).trim().replace(REF, (_, g, n) => {
    if (g === "spacing" || g === "containers") return `${t[g][n]}`;
    return `\`${{ colors: n, typography: `text-${n}`, rounded: `rounded-${n}`, shadows: `shadow-${n}`, easing: `ease-${n}` }[g]}\``;
  });
}

export function designMd(rec) {
  const t = rec.tokens;
  const s = rec.sections ?? {};
  const L = [
    `# DESIGN.md`, ``,
    `<!-- Generated by \`npm run apply-design\` from ${RECORD}: change the record, not this file. -->`, ``,
    `**${rec.title}.** ${prose(rec.summary ?? "", t)}`, ``,
    `The tokens are compiled into \`styles/theme.css\`.`, ``,
    `## Identity`, ``, "```text",
    ...Object.entries(IDENTITY).map(([k, label]) => `${(label + ":").padEnd(20)}${rec.identity?.[k] ?? "to fill"}`),
    "```", ``,
  ];
  for (const [key, heading] of SECTIONS) {
    const body = s[key];
    L.push(`## ${heading}`, ``);
    if (key === "colors") {
      L.push(`| Token | Value |`, `|---|---|`, ...Object.entries(t.colors).map(([k, v]) => `| \`${k}\` | ${prose(v, t)} |`), ``);
    }
    if (key === "typography") {
      L.push(`| Class | Family | Size | Line height | Tracking | Weight |`, `|---|---|---|---|---|---|`);
      for (const [k, v] of Object.entries(t.typography)) L.push(`| \`text-${k}\` | ${v.fontFamily} | ${v.fontSize} | ${v.lineHeight ?? ""} | ${v.letterSpacing ?? ""} | ${v.fontWeight ?? ""} |`);
      L.push(``);
    }
    if (key === "dos_and_donts") {
      for (const [side, title] of [["do", "Do"], ["dont", "Don't"]]) {
        L.push(`${title}:`, ``, ...(body?.[side] ?? []).flatMap(({ rule, why }) => [`- ${prose(rule, t)}`, `  ${prose(why, t)}`]), ``);
      }
    } else if (body) {
      L.push(prose(body, t), ``);
    }
  }
  L.push(`## Declared`, ``,
    `The patterns this site uses on purpose.`, ``,
    ...((rec.x_declares ?? []).length ? rec.x_declares.map((id) => `- ${id}: ${prose(rec.x_declares_reasons[id], t).replace(/\s+/g, " ")}`) : [`Nothing declared.`]), ``);
  const ext = Object.fromEntries(EXTENSIONS.filter((k) => rec[k]).map((k) => [k, rec[k]]));
  if (Object.keys(ext).length) {
    L.push(`## Invariants, imagery, motion and layout`, ``,
      `How each kind of content is laid out, photographed and moved, exactly as the record states it.`, ``,
      "```yaml", YAML.stringify(ext, { lineWidth: 0 }).trimEnd(), "```", ``);
  }
  const list = (group, cls) => Object.keys(t[group] ?? {}).map((k) => `\`${cls(k)}\``).join(", ");
  L.push(`## Agent Prompt Guide`, ``,
    `- Colours (as \`bg-\`, \`text-\`, \`border-\`): ${list("colors", (k) => k)}.`,
    `- Families: ${families(t.typography).map(([n]) => `\`font-${n}\``).join(", ")}. Sizes: ${list("typography", (k) => `text-${k}`)}.`,
    ...(t.rounded ? [`- Edges: ${list("rounded", (k) => `rounded-${k}`)}${t.shadows ? `; ${list("shadows", (k) => `shadow-${k}`)}` : ""}.`] : []),
    ...(t.spacing ? [`- Spacing (with \`p\`, \`m\`, \`gap\` and their sides): ${list("spacing", (k) => k)}.`] : []),
    ...(t.containers ? [`- Widths: ${list("containers", (k) => `max-w-${k}`)}.`] : []),
    ``,
    `## Changing the design`, ``,
    `Edit \`${RECORD}\` and run \`npm run apply-design\`.`,
    `A new brand colour or font goes into the record's tokens by role, never into markup. How a record is`,
    `written, and how it grows from the first homepage, is the \`design\` skill.`, ``);
  return L.join("\n");
}

/** src/fonts.ts: the Google Fonts URL for the record's families at the weights
 *  its type styles use, leaving out system fonts, whole stacks and the families
 *  styles/input.css self-hosts with @font-face. */
export function fontsTs(rec) {
  const selfHosted = new Set([...readFileSync("styles/input.css", "utf8").matchAll(/@font-face\s*\{[^}]*font-family:\s*["']?([^"';]+)/g)].map((m) => m[1].trim().toLowerCase()));
  const weights = new Map();
  for (const v of Object.values(rec.tokens.typography)) {
    const family = v.fontFamily;
    if (!family || family.includes(",") || SYSTEM_FONTS.test(family) || selfHosted.has(family.toLowerCase())) continue;
    if (!weights.has(family)) weights.set(family, new Set());
    weights.get(family).add(Number(v.fontWeight) || 400);
  }
  const families = [...weights].map(([f, w]) => `family=${f.replace(/ /g, "+")}:wght@${[...w].sort((a, b) => a - b).join(";")}`);
  const url = families.length ? `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap` : "";
  return `// Generated by \`npm run apply-design\` from ${RECORD}: change the record, not this file.
// The Google Fonts stylesheet for the record's families, or "" when every
// family is a system font or self-hosted (@font-face in styles/input.css).
export const googleFontsUrl = ${JSON.stringify(url)};
`;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  start("apply-design", `usage: npm run apply-design

Compiles design/system.yaml into styles/theme.css, DESIGN.md and src/fonts.ts,
and prints which it wrote. A record with problems lists them on stderr and
exits 1, writing nothing.`);
  const rec = readRecord();
  const found = problems(rec);
  if (found.length) fail(`apply-design: ${RECORD} has ${found.length} problem(s)\n  - ${found.join("\n  - ")}`, "npm run apply-design, once the record is fixed");
  const outputs = [[THEME, themeCss(rec)], [DESIGN, designMd(rec)], [FONTS, fontsTs(rec)]];
  const changed = outputs.filter(([f, body]) => !existsSync(f) || readFileSync(f, "utf8") !== body);
  for (const [f, body] of changed) writeFileSync(f, body);
  console.log(changed.length ? `apply-design: wrote ${changed.map(([f]) => f).join(", ")} from ${RECORD}` : `apply-design: ${THEME}, ${DESIGN} and ${FONTS} already match ${RECORD}`);
  console.log("\nNext: npm run check");
}

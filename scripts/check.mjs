#!/usr/bin/env node
// Is anything wrong? `npm run check` builds, then tests what a visitor would get.
// Every finding prints at once, so all are fixed in one pass. Blocks a deploy.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { done, fail, has, machineEnv } from "../src/data/cli.mjs";
import { loadSources, sameUrl, squash } from "./evidence.mjs";
import { at, frontMatter, readJson, start, today, walk, here } from "./lib.mjs";

const a = start("check", `usage: npm run check [-- --built]

Builds the pages (--built uses dist/ as it is), then fails on: a broken internal link
or a missing script or stylesheet; a page open to search, a canonical tag, a sitemap,
or robots.txt that blocks crawling (search must see the noindex); a page that does not say it is a preview; any review
or rating markup; a quote not in raw/; an offer shown as current after it expired; a
profile used without a confirmed match; text from a record's body on a page; HTML that
would run or a link with an unsafe scheme; an AI tell in the templates or records; a
Node import in the Worker; too many files for Cloudflare. With --built (before a
deploy) also: no agency_url in SITE.md, and lead forwarding without what it needs.
Prints every finding, by area. Exit 0 clean, 1 with findings.`, { bools: ["built"] });

const findings = [];
const add = (area, where, what) => findings.push({ area, where, what });
const dist = at("dist");

const data = (name, fallback) => readJson(at("data", `${name}.json`), fallback);
if (!existsSync(at("data", "stats.json"))) fail("check: data/ has not been built", "node scripts/build-data.mjs");

const tsc = spawnSync("node_modules/.bin/tsc", ["--noEmit"], { encoding: "utf8" });
if (tsc.status !== 0) add("code", "TypeScript", tsc.stdout.trim().split("\n").slice(0, 8).join("\n    "));

// What the AI wrote for a page to say, and the words in the templates: the tells a reader would catch.
const copy = spawnSync("node", [here("..", ".claude", "skills", "tropes", "tropes.mjs"), "--scan", here("..", "src", "pages"), here("..", "src", "components.tsx"), here("..", "src", "shell.tsx")], { encoding: "utf8" });
if (copy.status === 1) add("copy", "templates", `${copy.stdout}${copy.stderr}`.trim().split("\n").slice(0, 12).join("\n    "));
const written = data("companies", []).flatMap((c) => [c.pitch?.headline, ...(c.pitch?.points ?? []).map((p) => p.text), c.background?.summary].filter(Boolean).map((text) => `${c.slug}: ${text}`));
const asked = spawnSync("node", [here("..", ".claude", "skills", "tropes", "tropes.mjs"), "--kind", "text", "-"], { encoding: "utf8", input: written.join("\n") });
if (asked.status === 1) add("copy", "records", `${asked.stdout}${asked.stderr}`.trim().split("\n").slice(0, 12).join("\n    "));

if (!has(a, "built")) {
  const r = spawnSync("node_modules/.bin/tsx", ["scripts/build.ts"], { encoding: "utf8", env: process.env });
  if (r.status !== 0) fail(`check: the build failed\n${`${r.stdout}${r.stderr}`.trim()}`, "npm run build");
}
if (!existsSync(join(dist, "404.html"))) fail("check: dist/ is empty", "npm run build");

const htmlFiles = walk(dist).filter((f) => f.endsWith(".html"));
const pathOf = (f) => `/${f.slice(dist.length + 1).replace(/\.html$/, "")}`;
const pages = new Map(htmlFiles.map((f) => [pathOf(f), readFileSync(f, "utf8")]));
const flags = new Map(data("pages", []).map((p) => [p.path, p]));

// ---- Links: every internal one lands, and every script and stylesheet is there ----
const DYNAMIC = new Set(["/"]);
for (const [path, html] of pages) {
  if (path === "/404") continue;
  for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
    if (/^\s*(javascript|data|vbscript):/i.test(href)) add("safety", path, `a link with an unsafe scheme: ${href.slice(0, 60)}`);
    if (!href.startsWith("/")) continue;
    const target = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
    if (!pages.has(target) && !DYNAMIC.has(target)) add("links", path, `links to ${target}, which isn't a page`);
  }
}
const missing = new Set();
for (const [, ref] of [...pages.values()].join("").matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)="(\/[^"?#]*\.(?:js|css))"/g)) {
  if (!missing.has(ref) && !existsSync(join(dist, ref))) {
    missing.add(ref);
    add("links", "/", `pages load ${ref}, which isn't in dist/`);
  }
}

// ---- Out of search: a preview never competes with the company's own site ----
const owner = frontMatter(readFileSync(at("SITE.md"), "utf8"))?.data ?? {};
if (has(a, "built") && owner.forward_leads === true) {
  const env = machineEnv();
  if (!env.DATABASE_URL) add("leads", "SITE.md", "forward_leads is on, but quote requests have no database to be saved in");
  if (!/^(resend|postmark)/.test(env.NOTIFY_VIA ?? "") || !env.NOTIFY_FROM) add("leads", "SITE.md", "forward_leads is on, but nothing can email a business: connect Resend or Postmark, and set NOTIFY_VIA and NOTIFY_FROM");
}
if (has(a, "built") && !/^https:\/\//.test(owner.agency_url ?? "")) add("agency", "SITE.md", "agency_url is empty: the bare domain and every page's 'see how it works' link go nowhere");
if (/Disallow: \/\s*$/m.test(existsSync(join(dist, "robots.txt")) ? readFileSync(join(dist, "robots.txt"), "utf8") : "")) add("seo", "/robots.txt", "blocks crawling, so search engines never see the pages' noindex");
if (walk(dist).some((f) => /\/sitemap[^/]*\.xml$/.test(f))) add("seo", "dist/", "has a sitemap: previews stay out of search");
for (const [path, html] of pages) {
  if (path === "/404") continue;
  if (!/<title>[^<]+<\/title>/.test(html)) add("page", path, "has no title");
  if (!/<meta name="robots" content="noindex/.test(html)) add("seo", path, "is open to search: every preview says noindex");
  if (html.includes('rel="canonical"')) add("seo", path, "has a canonical tag: a preview points nowhere");
  if (/aggregateRating|"@type":"Review"|itemprop="(ratingValue|reviewRating)"/.test(html)) add("seo", path, "has review or rating markup: Google says not to aggregate ratings from other sites");
  if (flags.get(path) && !/A preview [\s\S]{0,400}official site/.test(html)) add("page", path, "does not say it is a preview, not the company's own site");
  // ---- Safety: nothing from a source can run ----
  if (/<[a-z]+\b[^>]*\son[a-z]+\s*=/i.test(html)) add("safety", path, "has an inline event handler");
  if (/<(iframe|object|embed)\b/i.test(html)) add("safety", path, "embeds outside content");
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const known = /src="\/site\.js"/.test(attrs);
    if (!known) add("safety", path, `has a script that is not ours: ${(attrs + body).slice(0, 60)}`);
  }
}

// ---- The facts on the pages ----
const companies = data("companies", []);
const TODAY = today();
const blocksOf = new Map();
const blocks = (slug) => {
  if (!blocksOf.has(slug)) blocksOf.set(slug, loadSources(slug));
  return blocksOf.get(slug);
};
for (const c of companies) {
  const facts = [...c.guarantees, ...c.offers, ...c.services, ...c.brands, ...c.proof, ...c.details, ...c.testimonials, ...(c.background?.evidence ?? []), ...c.servesQuotes];
  for (const f of facts) {
    if (f.corrected || !f.quote) continue;
    const q = squash(f.quote);
    const here = blocks(c.slug).filter((b) => !b.held && b.text.includes(q));
    if (!here.length) add("quotes", c.path, `"${f.quote.slice(0, 80)}" is not in raw/${c.slug}/`);
    else if (f.url && !here.some((b) => b.everyPage || sameUrl(b.url) === sameUrl(f.url))) add("quotes", c.path, `"${f.quote.slice(0, 60)}" is not at ${f.url}`);
  }
  for (const o of c.offers) if (o.ends && o.ends < TODAY) add("offers", c.path, `"${o.title}" ended ${o.ends} and shows as current: node scripts/build-data.mjs`);
  // A profile we could not confirm never reaches its page.
  for (const m of readJson(at("raw", c.slug, "matches.json"), [])) {
    if ((m.status === "held" || m.status === "rejected") && pages.get(c.path)?.includes(m.url)) add("matches", c.path, `uses ${m.url}, which matches.json does not confirm`);
  }
  // Private text: a record's body is for the AI, not the page.
  const record = existsSync(at("records", `${c.slug}.md`)) ? frontMatter(readFileSync(at("records", `${c.slug}.md`), "utf8")) : null;
  const html = pages.get(c.path) ?? "";
  for (const line of (record?.body ?? "").split("\n").map((l) => l.trim()).filter((l) => l.length > 60)) {
    if (html.includes(line.replace(/&/g, "&amp;"))) add("private", c.path, `shows a line from the body of records/${c.slug}.md: "${line.slice(0, 60)}"`);
  }
}
for (const [path, html] of pages) if (/raw\/[a-z0-9-]+\/|records\/[a-z0-9-]+\.md/.test(html)) add("private", path, "names a working file in the page");

// ---- What Cloudflare takes ----
if (existsSync(at("build", "worker.mjs")) && /from\s*["']node:/.test(readFileSync(at("build", "worker.mjs"), "utf8"))) add("code", "src/worker.ts", "the Worker imports a Node built-in: keep it out of what src/public.tsx reaches");
const all = walk(dist);
if (all.length > 20000) add("size", "dist/", `${all.length} files: plan for under 20,000, or move pictures to R2`);
for (const f of all) if (statSync(f).size > 25 * 1024 * 1024) add("size", f.slice(dist.length), "over Cloudflare's 25 MiB a file");

if (findings.length) {
  const areas = [...new Set(findings.map((f) => f.area))];
  const lines = areas.flatMap((x) => [`${x}:`, ...findings.filter((f) => f.area === x).slice(0, 40).map((f) => `  ${f.where}: ${f.what}`)]);
  console.error(`check: ${findings.length} finding${findings.length === 1 ? "" : "s"}\n${lines.map((l) => `  ${l}`).join("\n")}\n  Try: fix them, then npm run check`);
  process.exit(1);
}
done("check", `${pages.size} pages clean: links, out of search, quotes, offers, matches, safety, size`, { next: "tt-crawl shoot /<slug>" });

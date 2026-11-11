#!/usr/bin/env node
// Checks one company's record against what was gathered: every quote is really
// in its cited source, and every value is one this niche allows. The read-company
// skill's run fixes what this finds; pipeline done refuses without a pass.
import { existsSync, readFileSync } from "node:fs";
import { checkFlags, done, fail, has, misused, out, parseArgs } from "../src/data/cli.mjs";
import { loadSources, sameUrl, squash } from "./evidence.mjs";
import { at, frontMatter, readCompanies, readYaml } from "./lib.mjs";

const HELP = `usage: node scripts/check-record.mjs <company> | --all [--json]

Checks records/<company>.md: every quote appears in the file its url names
(ignoring case and spacing); urls are this company's own sources; field values
are in fields.yaml; dates are real; pictures exist; nothing comes from a source
matches.json holds or rejects. Prints every finding with its place in the record,
what is wrong and what to write instead. Exit 0 when clean, 1 with findings, 2 misused.`;

const a = parseArgs(process.argv.slice(2), { bare: ["all"] });
if (has(a, "help")) {
  console.log(HELP);
  process.exit(0);
}
checkFlags(a, ["all"], "check-record");
if (has(a, "all") === Boolean(a._[0]) || a._.length > 1) misused("check-record: name one company, or --all", "node scripts/check-record.mjs --all");

/** Every finding on one record. `fields` is fields.yaml. */
function checkRecord(slug, record, blocks, fields) {
  const findings = [];
  const add = (where, what) => findings.push({ where, what });
  const d = record.data;
  const words = (s) => String(s).trim().split(/\s+/).length;

  /** The evidence check, the heart of it. */
  const evidence = (where, item) => {
    if (item?.corrected) return;
    if (!item?.quote) return add(where, "has no quote: every fact needs a short exact quote. No quote, no fact");
    if (!item.url) return add(where, `has no url: name the page or post "${item.quote}" came from`);
    if (words(item.quote) > 60) add(where, `its quote runs ${words(item.quote)} words: keep it under 60, the part that carries the fact`);
    const q = squash(item.quote);
    const here = blocks.filter((b) => b.text.includes(q));
    if (!here.length) return add(where, `quote not found in anything gathered: "${item.quote}". Copy it exactly from raw/${slug}/`);
    const ok = here.filter((b) => !b.held);
    if (!ok.length) return add(where, `quote only appears in ${here[0].file}, a source matches.json does not confirm: leave it out`);
    if (!ok.some((b) => b.everyPage || sameUrl(b.url) === sameUrl(item.url))) add(where, `quote is not at ${item.url}: it appears at ${ok[0].url || ok[0].file}. Cite that`);
  };

  const inList = (where, value, list, name) => {
    if (value === "other" || !list?.length) return;
    if (!list.includes(value)) add(where, `"${value}" is not in fields.yaml's ${name} (${list.join(", ")}): use one of them, or "other"`);
  };
  const realDate = (where, v) => {
    if (v == null || v === "") return;
    const s = String(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) add(where, `"${v}" is not a date: write YYYY-MM-DD, or leave it out if the source states none`);
  };

  const known = new Set(["name", "in_niche", "scope", "serves", "serves_evidence", "background", "services", "guarantees", "offers", "brands", "proof", "keywords", "details", "testimonials", "reviews", "media", "pitch", "no_leads"]);
  for (const k of Object.keys(d)) {
    if (!known.has(k)) add(k, `is not a record field. ${/phone|email|address|hours|rating|website|logo/.test(k) ? "Contact details and ratings are filled in by script: leave them out" : `The fields: ${[...known].join(", ")}; anything else goes in the body below the front matter`}`);
  }
  if (!d.name) add("name", "is missing");
  if (d.pitch) {
    if (!d.pitch.headline) add("pitch.headline", "is missing");
    else if (words(d.pitch.headline) > 12) add("pitch.headline", `runs ${words(d.pitch.headline)} words: keep it to 12`);
    if (/[—]/.test(d.pitch.headline ?? "")) add("pitch.headline", "has an em dash: use plain words");
    evidence("pitch.headline", d.pitch);
    (d.pitch.points ?? []).forEach((p, i) => {
      if (words(p.text ?? "") > 8) add(`pitch.points[${i}]`, `runs ${words(p.text ?? "")} words: keep it to 8`);
      evidence(`pitch.points[${i}]`, p);
    });
  }
  if (d.scope && !["local", "national", "online"].includes(d.scope)) add("scope", `"${d.scope}" is not local, national or online`);

  const list = (k) => {
    if (d[k] == null) return [];
    if (!Array.isArray(d[k])) {
      add(k, "must be a list");
      return [];
    }
    return d[k];
  };

  (d.serves_evidence ?? []).forEach((e, i) => evidence(`serves_evidence[${i}]`, e));
  if (list("serves").length && !d.serves_evidence?.length) add("serves", "has no serves_evidence: quote where the company says it");
  (d.background?.evidence ?? []).forEach((e, i) => evidence(`background.evidence[${i}]`, e));
  if ((d.background?.summary || d.background?.founded || d.background?.people?.length) && !d.background?.evidence?.length && d.in_niche !== false) add("background", "has no evidence: quote where each detail came from");
  if (d.background?.founded && !/^\d{4}$/.test(String(d.background.founded))) add("background.founded", `"${d.background.founded}" is not a year`);

  list("services").forEach((s, i) => {
    evidence(`services[${i}]`, s);
    inList(`services[${i}].name`, s.name, (fields.services ?? []).map((x) => (typeof x === "string" ? x : Object.keys(x)[0])), "services");
  });
  list("guarantees").forEach((g, i) => {
    evidence(`guarantees[${i}]`, g);
    inList(`guarantees[${i}].kind`, g.kind, fields.guarantee_kinds, "guarantee_kinds");
    if (g.promise && words(g.promise) > 14) add(`guarantees[${i}].promise`, `runs ${words(g.promise)} words: say what the customer gets in 14`);
    if (g.promise && /;/.test(g.promise)) add(`guarantees[${i}].promise`, "has a semicolon: write it as a person would say it");
    if (g.whose && !["company", "manufacturer"].includes(g.whose)) add(`guarantees[${i}].whose`, `"${g.whose}" is not company or manufacturer; leave it out if the source does not say`);
  });
  list("offers").forEach((o, i) => {
    evidence(`offers[${i}]`, o);
    inList(`offers[${i}].kind`, o.kind, fields.offer_kinds, "offer_kinds");
    if (!o.title) add(`offers[${i}]`, "has no title");
    else if (words(o.title) > 10) add(`offers[${i}].title`, `runs ${words(o.title)} words: name the deal in 6 or so, the amount first`);
    realDate(`offers[${i}].ends`, o.ends);
    const sources = ["site", "facebook_post", "instagram_post", "facebook_ad", "google_ad", "review"];
    if (!sources.includes(o.source)) add(`offers[${i}].source`, `"${o.source}" is not one of ${sources.join(", ")}`);
  });
  list("brands").forEach((b, i) => evidence(`brands[${i}]`, b));
  list("proof").forEach((p, i) => {
    evidence(`proof[${i}]`, p);
    inList(`proof[${i}].kind`, p.kind, fields.proof_kinds, "proof_kinds");
  });
  list("details").forEach((x, i) => {
    evidence(`details[${i}]`, x);
    inList(`details[${i}].name`, x.name, (fields.details ?? []).map((y) => (typeof y === "string" ? y : Object.keys(y)[0])), "details");
  });
  list("testimonials").forEach((t, i) => evidence(`testimonials[${i}]`, t));
  for (const side of ["praise", "complaints"]) {
    (d.reviews?.[side] ?? []).forEach((r, i) => {
      const where = `reviews.${side}[${i}]`;
      if (!r.theme) add(where, "has no theme");
      if (r.count != null) add(`${where}.count`, 'code does the counting: remove it, and give "words", the words a review of this theme uses');
      if (!blocks.some((b) => !b.held && b.text.includes(squash(r.quote ?? "\u0000")))) add(where, `quote not found in anything gathered: "${r.quote}"`);
    });
  }

  const pictureKinds = ["team", "work", "before_after", "premises", "logo", "stock", "other"];
  list("media").forEach((m, i) => {
    const where = `media[${i}]`;
    if (!pictureKinds.includes(m.kind)) add(`${where}.kind`, `"${m.kind}" is not one of ${pictureKinds.join(", ")}`);
    if (m.kind === "stock") add(where, "is stock: leave it out");
    if (!m.alt) add(`${where}.alt`, "is missing: say what the picture shows");
    if (!m.file || !existsSync(at("raw", slug, m.file))) add(`${where}.file`, `raw/${slug}/${m.file} does not exist: name a file from raw/${slug}/, such as site/images/<file>`);
  });
  if (list("offers").length > 12) add("offers", `holds ${d.offers.length} offers: one entry per deal a customer could ask for`);
  if (list("media").length > 12) add("media", `holds ${d.media.length} pictures: keep the best 12`);
  return findings;
}

const fields = readYaml(at("fields.yaml"));
const slugs = has(a, "all") ? readCompanies().filter((r) => existsSync(at("records", `${r.slug}.md`))).map((r) => r.slug) : [a._[0]];
const everyone = {};
for (const slug of slugs) {
  const file = at("records", `${slug}.md`);
  if (!existsSync(file)) fail(`check-record: no record for ${slug}: records/${slug}.md is not there`, `node scripts/pipeline.mjs next company, then write records/${slug}.md`);
  const record = frontMatter(readFileSync(file, "utf8"));
  if (!record) everyone[slug] = [{ where: "front matter", what: "is missing: the record starts with --- and ends it with ---" }];
  else if (record.error) everyone[slug] = [{ where: "front matter", what: `does not parse as YAML: ${record.error.split("\n")[0]}` }];
  else everyone[slug] = checkRecord(slug, record, loadSources(slug), fields);
}
const total = Object.values(everyone).flat().length;
if (has(a, "json")) out(true, everyone, () => "");
else if (!total) done("check-record", `${slugs.length === 1 ? slugs[0] : `${slugs.length} records`}: every quote traced, every value allowed`, { next: slugs.length === 1 ? `node scripts/pipeline.mjs done company ${slugs[0]}` : "node scripts/build-data.mjs" });
else {
  const lines = Object.entries(everyone).flatMap(([slug, f]) => f.map((x) => `records/${slug}.md ${x.where}: ${x.what}`));
  console.error(`check-record: ${total} finding${total === 1 ? "" : "s"}\n${lines.map((l) => `  ${l}`).join("\n")}\n  Try: fix them in the record, then node scripts/check-record.mjs ${slugs.length === 1 ? slugs[0] : "--all"}`);
}
if (total) process.exit(1);

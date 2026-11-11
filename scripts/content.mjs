#!/usr/bin/env node
// SITE.md's settings for the code the Worker bundles, which reads no files:
// src/generated/site.json. The dev loop and the build run it.
import { readFileSync } from "node:fs";
import { at, frontMatter, start, writeJson, here } from "./lib.mjs";

start("content", `usage: node scripts/content.mjs

Writes SITE.md's agency, domain, niche, area and sender settings to
src/generated/site.json. Prints one line. The dev loop and npm run build run it.`);

const d = frontMatter(readFileSync(at("SITE.md"), "utf8"))?.data ?? {};
const named = (v, fallback) => (v && !String(v).startsWith("to fill") ? v : fallback);
const bare = (v) => String(named(v, "") ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
writeJson(here("..", "src", "generated", "site.json"), {
  name: named(d.agency_name, "Outreach"),
  agencyUrl: String(named(d.agency_url, "") ?? "").replace(/\/+$/, ""),
  domain: bare(d.domain),
  niche: named(d.niche, ""),
  noun: named(d.noun, "companies"),
  area: named(d.area, ""),
  url: String(d.url ?? "").replace(/\/+$/, ""),
  contactEmail: d.contact_email ?? "",
  forwardLeads: d.forward_leads === true,
});
console.log("content: src/generated/site.json written from SITE.md");

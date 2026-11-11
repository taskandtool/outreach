#!/usr/bin/env node
// Finding businesses and gathering what is published about them, with no AI:
// the first stages of the pipeline. Everything lands in files, so no source is
// paid for twice and a stopped run picks up where it was. See gather.mjs for
// the vendors.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { flag, has, limitOf, done, fail, misused, noMore, parseArgs, usage } from "../src/data/cli.mjs";
import { gatherCompany, gatherPlan, availableSources } from "./gather.mjs";
import { cleanCity, cleanPhone, cleanWebsite, mergePlaces, nameKey } from "./merge.mjs";
import { at, cell, hasCommand, log, parseCsv, readCompanies, readJson, slugify, sourceHash, today, updateCompany, withLock, writeCompanies, writeJson } from "./lib.mjs";

const HELP = `usage: node scripts/companies.mjs <command> [options]

  categories --bbox W,S,E,N [--search hvac]
      Overture's business categories in that box, with counts. Downloads the
      box once to raw/overture/; later commands read the saved file.
  find [--categories a,b] [--bbox W,S,E,N] [--min-confidence 0.5] [--latest]
  find --import file.csv
      Every business in the box under those categories (the last ones used when not
      named), or in the owner's CSV
      (name, and any of website, phone, email, address, city, region, postcode,
      lat, lng), one row per company in companies.csv: several places with one
      domain or phone are one company with several locations. Safe to run again:
      a company already found keeps its state, a new one is added, and one no
      longer in the source is flagged for a person, never removed. --latest
      downloads Overture's newest release first (the quarterly job). Prints
      counts, examples and what the next stages would cost.
  crawl [--limit N] [--company slug] [--max-pages 40] [--minutes 25]
      Reads the queued companies' sites into raw/<company>/site/ through tt-crawl,
      two at a time. A site that refuses is recorded and the company carries on
      from its other sources. Free.
  gather [--limit N] [--company slug] [--minutes 25] [--confirm]
      Every other source this app holds a connection for, each match confirmed
      before use (raw/<company>/matches.json). Without --confirm it says what it
      would call and spends nothing.
  refresh --offers|--all [--limit N] [--minutes 25] [--confirm]
      Fetches ads and recent posts again (--offers), or sites, profiles and
      reviews too (--all). A company whose material changed is queued for a
      fresh read; one that did not costs no AI.

Each prints what it did, by company, then Next:. Exit 0 done, 1 failed or a
missing connection, 2 misused.`;

const a = parseArgs(process.argv.slice(2), { bare: ["confirm", "latest", "offers", "all"] });
const [cmd, ...rest] = a._;
usage(a, cmd, ["categories", "find", "crawl", "gather", "refresh"], HELP, "companies", {
  categories: ["bbox", "search"],
  find: ["categories", "bbox", "min-confidence", "latest", "import"],
  crawl: ["limit", "company", "max-pages", "minutes"],
  gather: ["limit", "company", "minutes", "confirm"],
  refresh: ["offers", "all", "limit", "minutes", "confirm"],
});
noMore(rest, 0, `companies ${cmd}`);

// ---- Overture ----

const PLACES = at("raw", "overture", "places.geojson");
const DIVISIONS = at("raw", "overture", "division_area.geojson");
const BOX = at("raw", "overture", "box.json");
const REFRESH = at(".pipeline", "refresh.json");

function parseBbox(s) {
  const n = s.split(",").map(Number);
  if (n.length !== 4 || n.some(Number.isNaN) || n[0] >= n[2] || n[1] >= n[3]) misused(`companies: --bbox must be west,south,east,north; got ${s}`, "node scripts/companies.mjs categories --bbox -97.9,30.4,-97.55,30.72");
  return n;
}

function overture(type, bbox, out) {
  if (!hasCommand("overturemaps")) fail("companies: the overturemaps command is not installed", "bash .taskandtool/after-setup.sh");
  const r = spawnSync("overturemaps", ["download", `--bbox=${bbox.join(",")}`, "-f", "geojson", `--type=${type}`, "-o", out], { encoding: "utf8" });
  if (r.status !== 0) fail(`companies: Overture's ${type} download failed\n  ${(r.stderr || "").trim().split("\n").pop()}`, "run it again; it is free and nothing was lost");
}


/** The box's places, from the saved download; a new box or --latest downloads again. */
function placesFor(bboxFlag, latest) {
  const saved = readJson(BOX);
  const bbox = bboxFlag ? parseBbox(bboxFlag) : saved?.bbox;
  if (!bbox) fail("companies: no area yet: name it with --bbox west,south,east,north", "node scripts/companies.mjs categories --bbox -97.9,30.4,-97.55,30.72 --search hvac");
  const stale = latest || !existsSync(PLACES) || !saved || saved.bbox.join() !== bbox.join();
  if (stale) {
    overture("place", bbox, PLACES);
    overture("division_area", bbox, DIVISIONS);
    writeJson(BOX, { ...saved, bbox, downloaded: today() });
  }
  return JSON.parse(readFileSync(PLACES, "utf8")).features;
}

const categoryOf = (p) => p.taxonomy?.primary ?? p.categories?.primary ?? p.basic_category ?? "";
const categoriesOf = (p) => [categoryOf(p), ...(p.taxonomy?.alternates ?? p.categories?.alternate ?? [])].filter(Boolean);

function fromOverture(features, wanted, minConfidence) {
  return features
    .filter((f) => f.properties.operating_status !== "closed" && f.properties.operating_status !== "permanently_closed")
    .filter((f) => categoriesOf(f.properties).some((c) => wanted.includes(c)))
    .map((f) => {
      const p = f.properties;
      const ad = p.addresses?.[0] ?? {};
      const [lng, lat] = f.geometry.coordinates;
      return {
        name: p.names?.primary ?? "",
        ...cleanWebsite(p.websites?.[0]),
        phones: (p.phones ?? []).map(cleanPhone).filter(Boolean),
        emails: p.emails ?? [],
        socials: p.socials ?? [],
        categories: categoriesOf(p),
        source: "overture",
        confidence: p.confidence ?? 0,
        locations: [{ address: ad.freeform ?? "", city: cleanCity(ad.locality), region: ad.region ?? "", postcode: (ad.postcode ?? "").slice(0, 5), lat, lng }],
      };
    })
    .filter((p) => p.name && p.confidence >= minConfidence);
}

function fromImport(file) {
  if (!existsSync(file)) fail(`companies find: no file ${file}`, "node scripts/companies.mjs find --import companies-to-add.csv");
  const rows = parseCsv(readFileSync(file, "utf8"));
  if (!rows.length || !("name" in rows[0])) fail(`companies find: ${file} needs a header row with a name column`, "name,website,phone,email,address,city,region,postcode,lat,lng");
  return rows
    .filter((r) => r.name)
    .map((r) => ({
      name: r.name,
      ...cleanWebsite(r.website),
      phones: [cleanPhone(r.phone)].filter(Boolean),
      emails: r.email ? [r.email] : [],
      socials: [],
      categories: [],
      source: "import",
      confidence: 1,
      locations: r.address || r.city || r.lat ? [{ address: r.address ?? "", city: cleanCity(r.city), region: r.region ?? "", postcode: (r.postcode ?? "").slice(0, 5), lat: r.lat ? Number(r.lat) : null, lng: r.lng ? Number(r.lng) : null }] : [],
    }));
}

/** Merges what was found into companies.csv; state already there stays. */
function saveFound(found, sourceName, day) {
  const rows = readCompanies();
  const taken = new Set(rows.map((r) => r.slug));
  const key = (c) => [c.domain && `d:${c.domain}`, ...c.phones.map((p) => `p:${p}`), `n:${nameKey(c.name)}`].filter(Boolean);
  const index = new Map();
  for (const r of rows) for (const k of key({ domain: r.domain, phones: cell(r, "phones"), name: r.name })) index.set(k, r);
  // A shared name is one company only if their sites don't say otherwise: one franchise name is many local companies.
  const sameCompany = (c, k, r) => !k.startsWith("n:") || !c.domain || !r.domain || c.domain === r.domain;
  const hit = new Set();
  let added = 0;
  for (const c of found) {
    const row = key(c).map((k) => index.get(k) && sameCompany(c, k, index.get(k)) && index.get(k)).find(Boolean);
    const lists = Object.entries({ phones: c.phones, emails: c.emails, socials: c.socials, categories: c.categories, locations: c.locations });
    const fields = { ...Object.fromEntries(lists.map(([k, v]) => [k, JSON.stringify(v)])), confidence: c.confidence.toFixed(2) };
    if (row) {
      hit.add(row.slug);
      // What this source doesn't hold stays as it was: a list of names and sites wipes nothing.
      Object.assign(row, Object.fromEntries(lists.filter(([, v]) => v.length).map(([k, v]) => [k, JSON.stringify(v)])), { confidence: fields.confidence, left_source: "" });
      if (!row.website && c.website) Object.assign(row, { website: c.website, domain: c.domain });
    } else {
      let slug = slugify(c.name) || "company";
      for (let n = 2; taken.has(slug); n++) slug = `${slugify(c.name)}-${n}`;
      taken.add(slug);
      hit.add(slug);
      rows.push({ slug, name: c.name, website: c.website, domain: c.domain, source: c.source, ...fields, state: "found", tries: "0", found_at: day });
      added++;
    }
  }
  let left = 0;
  for (const r of rows) {
    // An import is an addition: leaving one out of the next file says nothing.
    if (sourceName !== "import" && r.source.includes(sourceName) && !hit.has(r.slug) && !r.left_source && r.state !== "removed") {
      r.left_source = day;
      left++;
    }
  }
  writeCompanies(rows);
  return { rows, added, left };
}

// ---- The commands ----

/** What the plan's measured figures say the next stages cost; `pipeline status` reports real ones afterwards. */
function estimate(n, sources) {
  const lines = [`Reading ${n} companies: about $${(n * 0.0075).toFixed(2)} on GPT-6 Luna, $${Math.round(n * 0.15)} to $${Math.round(n * 0.2)} on GPT-6.1 Sol`];
  if (sources.scrapecreators) lines.push(`ScrapeCreators: about ${n * 10} credits, about $${Math.round(n * 10 * 0.00188)} to $${Math.round(n * 10 * 0.005)}`);
  if (sources.places) lines.push(`Google listing: ${n} calls of the Places API`);
  if (sources.dataforseo) lines.push(`Full Google reviews (DataForSEO): one task per company, priced per review`);
  if (!Object.keys(sources).length) lines.push("No connections yet, so only the company sites are read (free)");
  lines.push(`Crawling: about ${Math.ceil((n * 3) / 2 / 60)} hours of machine time and no AI`);
  return lines;
}

if (cmd === "categories") {
  const features = placesFor(flag(a, "bbox"), false);
  const counts = new Map();
  for (const f of features) for (const c of categoriesOf(f.properties)) counts.set(c, (counts.get(c) ?? 0) + 1);
  const term = flag(a, "search")?.toLowerCase();
  const list = [...counts].filter(([c]) => !term || c.includes(term)).sort((x, y) => y[1] - x[1]);
  if (term && !list.length) fail(`companies categories: no category holds "${term}" in this box`, "node scripts/companies.mjs categories, for all of them");
  done("companies categories", `${list.length} of ${counts.size} categories across ${features.length} places`, {
    lines: list.slice(0, 40).map(([c, n]) => `${c}: ${n}`).concat(list.length > 40 ? [`40 of ${list.length}; --search <word> to narrow`] : []),
    next: "node scripts/companies.mjs find --categories <the ones that fit>",
  });
}

if (cmd === "find") {
  const day = today();
  const file = flag(a, "import");
  let found;
  if (file) found = mergePlaces(fromImport(file));
  else {
    const wanted = flag(a, "categories")?.split(",").map((s) => s.trim()).filter(Boolean) ?? readJson(BOX)?.categories;
    if (!wanted?.length) misused("companies find: name --categories, or --import a CSV", "node scripts/companies.mjs categories --search <word>");
    const min = Number(flag(a, "min-confidence") ?? 0.5);
    // Low-confidence rows still merge into a company a better row vouches for.
    const places = fromOverture(placesFor(flag(a, "bbox"), has(a, "latest")), wanted, 0);
    found = mergePlaces(places).filter((c) => c.confidence >= min);
    if (found.length) writeJson(BOX, { ...readJson(BOX), categories: wanted });
  }
  if (!found.length) fail(`companies find: nothing matched ${file ?? flag(a, "categories")}`, "node scripts/companies.mjs categories --search <word>");
  const { rows, added, left } = await withLock(() => saveFound(found, file ? "import" : "overture", day));
  const withSite = rows.filter((r) => r.website).length;
  const cities = new Map();
  for (const r of rows) for (const l of cell(r, "locations")) if (l.city) cities.set(l.city, (cities.get(l.city) ?? 0) + 1);
  log(`find: ${added} new companies from ${file ?? "Overture"}, ${rows.length} in all`, day);
  done("companies find", `${rows.length} companies in companies.csv (${added} new, ${left} no longer in the source)`, {
    lines: [
      `${withSite} have a website; ${rows.filter((r) => cell(r, "locations").length > 1).length} have several locations`,
      `By city: ${[...cities].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([c, n]) => `${c} ${n}`).join(", ")}`,
      `Examples: ${rows.filter((r) => r.website).slice(0, 5).map((r) => `${r.name} (${r.domain})`).join("; ")}`,
      ...estimate(rows.length, availableSources()),
      "Nothing is spent until the owner says yes.",
    ],
    next: "node scripts/pipeline.mjs queue --sample 20, once the owner has said yes",
  });
}

const minutes = Number(flag(a, "minutes") ?? 25);
const deadline = Date.now() + minutes * 60_000;
const limit = limitOf(a, `companies ${cmd}`, { fallback: Infinity, max: 100000 });
const only = flag(a, "company");
const pick = (states) => {
  const rows = readCompanies();
  if (only && !rows.some((r) => r.slug === only)) fail(`companies ${cmd}: no company ${only}`, "node scripts/pipeline.mjs status");
  return rows.filter((r) => (only ? r.slug === only : states.includes(r.state))).slice(0, limit);
};

/** Runs a child to its end, its JSON line back; a stuck site cannot hold up the rest past the deadline. */
function runCrawl(args) {
  return new Promise((resolve) => {
    const c = spawn("tt-crawl", args, { stdio: ["ignore", "pipe", "pipe"], cwd: at() });
    let out = "";
    let err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => c.kill("SIGTERM"), Math.max(deadline - Date.now(), 1000));
    c.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
    c.on("close", (code) => {
      clearTimeout(timer);
      const line = out.trim().split("\n").pop();
      try {
        resolve({ ok: code === 0, code, ...JSON.parse(line) });
      } catch {
        resolve({ ok: code === 0, code, error: (err || out).trim().split("\n").slice(-2).join(" ").slice(0, 300) });
      }
    });
  });
}

const pagesRead = (out) => readJson(`${out}/_index/run.json`)?.read ?? 0;
/** Where the start page landed, when that is another host. */
function movedTo(out) {
  const first = readJson(`${out}/_index/inventory.json`)?.records?.[0];
  if (!first?.final_url) return null;
  return cleanWebsite(first.final_url).domain !== cleanWebsite(first.url).domain ? first.final_url : null;
}

/** Pages that show who a company is and its work: the ones a page cap leaves unread on a big site. */
const TELLING = /about|team|staff|meet|story|why-(us|choose)|gallery|portfolio|projects?\b|our-work|recent-work|before|photos|awards?|certif|communit|testimonial|reviews?|warrant|guarantee|special|offers?\b|coupon|promo|financ/i;

/** The pages that look telling, read or passed over, read again for every picture on them. Blog posts are left alone. */
function untold(out) {
  const records = readJson(`${out}/_index/inventory.json`)?.records ?? [];
  return records
    .filter((r) => (r.file || r.reason === "unread" || r.reason === "sampled_out") && !/[?#]|\/(blog|news|articles?|posts?)\//i.test(r.url) && TELLING.test(new URL(r.url).pathname))
    .map((r) => r.url)
    .slice(0, 20);
}

/** One company's site and its documents. A site that refuses is a note; the company carries on. */
async function crawlOne(row, maxPages) {
  if (!row.website) {
    await updateCompany(row.slug, (r) => {
      r.state = "crawled";
      r.note = "no website of its own";
    });
    return `${row.name}: no website of its own, listed from its other sources`;
  }
  const out = at("raw", row.slug, "site");
  const crawlSite = (url) => runCrawl(["brand", url, "--external", "--out", out, "--images", "brand", "--max-pages", String(maxPages), "--resume", "--json"]);
  let r = await crawlSite(row.website);
  // A domain that only redirects to another reads nothing: the company's site is where it lands.
  const moved = pagesRead(out) === 0 ? movedTo(out) : null;
  if (moved) {
    await updateCompany(row.slug, (x) => Object.assign(x, cleanWebsite(moved)));
    r = await crawlSite(moved);
  }
  const pages = pagesRead(out);
  if (!pages) {
    if (Date.now() >= deadline) return `${row.name}: stopped at the time limit, picked up next run`;
    await updateCompany(row.slug, (x) => {
      x.state = "crawled";
      x.site_failures = String(Number(x.site_failures || 0) + 1);
      x.note = `the site refused the crawler: ${r.error ?? r.refusal ?? "no pages read"}`.slice(0, 200);
    });
    return `${row.name}: the site refused the crawler, listed from its other sources`;
  }
  const telling = untold(out);
  if (telling.length) await runCrawl(["add", ...telling, "--out", out, "--images", "content", "--json"]);
  await runCrawl(["docs", "--from", out, "--json"]);
  await updateCompany(row.slug, (x) => {
    x.state = "crawled";
    x.site_failures = "0";
    x.note = "";
  });
  return `${row.name}: ${pages} pages in raw/${row.slug}/site/`;
}

/** In parallel, two at a time, stopping at the deadline. */
async function eachOf(rows, width, fn) {
  const lines = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: width }, async () => {
      while (i < rows.length && Date.now() < deadline) {
        const row = rows[i++];
        lines.push(await fn(row));
      }
    }),
  );
  return lines;
}

if (cmd === "crawl") {
  const rows = pick(["queued"]);
  if (!rows.length) done("companies crawl", "nothing queued to crawl", { next: "node scripts/pipeline.mjs status" });
  else {
    if (!hasCommand("tt-crawl")) fail("companies crawl: tt-crawl is not installed", "bash .taskandtool/after-setup.sh");
    const maxPages = Number(flag(a, "max-pages") ?? 40);
    if (!(maxPages >= 1)) misused(`companies crawl: --max-pages is a whole number from 1`, "node scripts/companies.mjs crawl --max-pages 40");
    const lines = await eachOf(rows, 2, (r) => crawlOne(r, maxPages));
    done("companies crawl", `${lines.length} of ${rows.length} sites`, { lines, next: "node scripts/pipeline.mjs status" });
  }
}

if (cmd === "gather") {
  const rows = pick(["crawled"]);
  const sources = availableSources();
  if (!rows.length) done("companies gather", "nothing crawled and waiting to gather", { next: "node scripts/pipeline.mjs status" });
  else if (!has(a, "confirm")) {
    const plan = gatherPlan(rows, sources);
    console.log(`companies gather: ${rows.length} companies, ${plan.credits} ScrapeCreators credits at most, ${plan.places} Google listing calls, ${plan.reviews} review tasks`);
    console.log(`  Connected: ${Object.keys(sources).join(", ") || "none, so nothing to gather; only company sites are read"}`);
    console.log("  Nothing was spent. If the owner said yes: node scripts/companies.mjs gather --confirm");
  } else {
    const lines = await eachOf(rows, 2, async (row) => {
      const r = await gatherCompany(row, sources, today());
      await updateCompany(row.slug, (x) => {
        if (!r.unfinished) x.state = "ready";
      });
      return r.line;
    });
    done("companies gather", `${lines.length} of ${rows.length} companies`, { lines, next: "node scripts/pipeline.mjs status" });
  }
}

if (cmd === "refresh") {
  if (!has(a, "offers") && !has(a, "all")) misused("companies refresh: say --offers or --all", "node scripts/companies.mjs refresh --offers");
  const rows = readCompanies().filter((r) => r.state === "done").slice(0, limit);
  const sources = availableSources();
  if (!has(a, "confirm")) {
    const plan = gatherPlan(rows, sources, has(a, "offers") ? "offers" : "all");
    console.log(`companies refresh: ${rows.length} companies, ${plan.credits} ScrapeCreators credits at most, ${plan.places} Google listing calls, ${plan.reviews} review tasks`);
    console.log(`  Nothing was spent. If the owner said yes: node scripts/companies.mjs refresh ${has(a, "offers") ? "--offers" : "--all"} --confirm`);
  } else {
    if (has(a, "all") && !hasCommand("tt-crawl")) fail("companies refresh: tt-crawl is not installed", "bash .taskandtool/after-setup.sh");
    const day = today();
    const kind = has(a, "offers") ? "offers" : "all";
    // A long refresh outlasts one job: what is finished stays finished, so nothing is paid for twice, and tick carries on from here.
    const cursor = readJson(REFRESH);
    const finished = new Set(cursor?.kind === kind ? cursor.finished : []);
    const changed = [];
    for (const row of rows) {
      if (finished.has(row.slug)) continue;
      if (Date.now() >= deadline) break;
      if (has(a, "all") && row.website && !(await refreshSite(row))) break;
      await gatherCompany(row, sources, day, { again: kind });
      if (sourceHash(row.slug) !== row.read_hash) {
        changed.push(row.name);
        await updateCompany(row.slug, (x) => {
          x.state = "ready";
          x.tries = "0";
        });
      }
      finished.add(row.slug);
      writeJson(REFRESH, { kind, finished: [...finished] });
    }
    const left = rows.filter((r) => !finished.has(r.slug)).length;
    if (!left) rmSync(REFRESH, { force: true });
    log(`refresh ${kind === "offers" ? "offers" : "everything"}: ${finished.size} checked, ${left} to go, ${changed.length} changed`, day);
    done("companies refresh", `${finished.size} checked, ${left} to go, ${changed.length} changed and queued for a fresh read`, { lines: changed.slice(0, 40), next: "node scripts/pipeline.mjs tick" });
  }
}

/** Reads a site again in place; two failures in a row flag it, and its page says when it was last confirmed. False when the run ran out of time and the site's answer means nothing. */
async function refreshSite(row) {
  const out = at("raw", row.slug, "site");
  const r = await runCrawl(["brand", row.website, "--external", "--out", out, "--images", "brand", "--max-pages", "40", "--json"]);
  if (r.code == null) return false;
  await updateCompany(row.slug, (x) => {
    x.site_failures = r.ok ? "0" : String(Number(x.site_failures || 0) + 1);
    if (Number(x.site_failures) >= 2) x.note = `the site has not answered since ${readJson(`${out}/_index/run.json`)?.finished?.slice(0, 10) ?? "the last read"}`;
  });
  return true;
}

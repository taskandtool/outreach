#!/usr/bin/env node
// Everything in data/, by code: one company each, expired offers retired, pictures
// resized, and which companies have enough for a page worth sending. Records hold what
// takes understanding; contact details and ratings come straight from what was
// gathered, each with where it came from. No AI, no spending.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { done, fail, flag } from "../src/data/cli.mjs";
import { loadSources, sameUrl, squash } from "./evidence.mjs";
import { areaNamed, areasAt, loadAreas } from "./geo.mjs";
import { at, cell, frontMatter, here, log, readCompanies, readJson, readYaml, slugify, start, today, walk, writeAtomic, writeJson } from "./lib.mjs";

const HELP = `usage: node scripts/build-data.mjs [--today YYYY-MM-DD]

Builds data/ from records/, raw/, aliases.yaml, fields.yaml and SITE.md:
companies with their contact details and ratings, statistics, and pages.json: one
page per company, never open to search, marked ready when it holds enough to send
(the gate). Retires offers past their end date or gone from their source.
Resizes kept pictures to static/media/. Safe to run any time. --today pins the
date for a test.

Prints what it built and what changed, then Next:. Exit 1 when no record can be read.`;

const a = start("build-data", HELP, { flags: ["today"] });
const TODAY = today(flag(a, "today"));

// ---- The owner's settings ----

const site = frontMatter(existsSync(at("SITE.md")) ? readFileSync(at("SITE.md"), "utf8") : "")?.data ?? {};
const GATE = { company_facts: 3, ...site.gate };
const fields = readYaml(at("fields.yaml"));
const aliases = readYaml(at("aliases.yaml"));

/** The one name for a thing, once aliases.yaml has merged its spellings. */
const canon = (group, name) => {
  const s = String(name ?? "").trim();
  const map = aliases[group] ?? {};
  const hit = Object.keys(map).find((k) => k.toLowerCase() === s.toLowerCase());
  return hit ? map[hit] : s;
};


// ---- Where a fact came from, as a reader is told it ----

const SOURCE_LABELS = { site: "on their website", facebook_post: "in their Facebook post", instagram_post: "in their Instagram post", facebook_ad: "running as a Facebook ad", google_ad: "running as a Google ad", review: "in a customer's review" };

function labelFor(url, domain) {
  const u = String(url ?? "");
  if (/facebook\.com\/ads\/library/.test(u)) return "running as a Facebook ad";
  if (/adstransparency\.google/.test(u)) return "running as a Google ad";
  if (/facebook\.com/.test(u)) return "on their Facebook page";
  if (/instagram\.com/.test(u)) return "on their Instagram";
  if (/linkedin\.com/.test(u)) return "on their LinkedIn";
  if (/tiktok\.com/.test(u)) return "on their TikTok";
  if (/\.pdf($|\?)/i.test(u)) return "in a document on their website";
  if (domain && u.includes(domain)) return "on their website";
  return "on a page they publish";
}

/** A web, mail or phone link, or nothing: source text never reaches a page as a live scheme. */
/** A phone worth dialling: ten digits, an optional country 1 dropped. */
const dialable = (s) => {
  const d = digits(s);
  const local = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  return local.length === 10 ? local : "";
};
/** An address mail can reach, without the encoded spaces and stray text sites leave around it. */
const mailable = (s) => {
  const e = String(s ?? "").replace(/%20/g, "").trim();
  return /^[^\s@:/%]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(e) ? e : "";
};
/** The page a site calls its terms, else its warranty page, from what the crawl discovered. */
function termsPage(slug) {
  const urls = (readJson(at("raw", slug, "site", "_index", "inventory.json"))?.records ?? []).map((r) => r.final_url ?? r.url).filter((u) => u && URL.canParse(u));
  const lastPart = (u) => new URL(u).pathname.replace(/\/+$/, "").split("/").pop();
  const pick = (re) => urls.filter((u) => re.test(lastPart(u))).sort((x, y) => x.length - y.length)[0];
  return safeUrl(pick(/^terms?([-_](and|of|&))?([-_](conditions?|service|use))?$/i) ?? pick(/(^|-)(warrant(y|ies)|guarantees?)$/i)) || null;
}

const NETWORKS = /^(?:[a-z0-9-]+\.)?(facebook|instagram|linkedin|tiktok|youtube|yelp|x|twitter)\.com$/i;
/** The company's own profiles, one per network: sites link to suppliers, partners and share pages too. */
function profiles(urls) {
  const byNetwork = new Map();
  for (const u of urls) {
    if (!URL.canParse(u)) continue;
    const { hostname, pathname } = new URL(u);
    const network = NETWORKS.exec(hostname)?.[1].toLowerCase().replace("twitter", "x");
    if (network && pathname.length > 1 && !/^\/(policy|policies|privacy|legal|terms|sharer|share|intent|plugins|help)\b/i.test(pathname) && !byNetwork.has(network)) byNetwork.set(network, u);
  }
  return [...byNetwork.values()];
}
const safeUrl = (u) => {
  const s = String(u ?? "").trim();
  return /^(https?:|mailto:|tel:)/i.test(s) ? s : "";
};
/** Source text: no markup survives, whatever a page or post tried to carry. */
const safeText = (s) => (s == null ? s : String(s).replace(/[<>]/g, "").trim());

// ---- One company ----

const digits = (s) => String(s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const formatPhone = (d) => (d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d);

const placesOf = (slug) => {
  const dir = at("raw", slug, "places");
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).find((x) => x.endsWith(".summary.json"));
  const held = readJson(at("raw", slug, "gather.json"))?.sources?.["google listing"]?.status === "held";
  return f && !held ? readJson(join(dir, f)) : null;
};

/** Facts from the sources, never picked between: every value with where it was seen. */
function contact(row, card, facts, places) {
  const phones = new Map();
  const seen = (raw, label) => {
    const key = dialable(raw);
    if (!key) return;
    if (!phones.has(key)) phones.set(key, { value: formatPhone(key), where: [] });
    if (!phones.get(key).where.includes(label)) phones.get(key).where.push(label);
  };
  for (const p of facts.phone ?? []) seen(p.value, "on their website");
  if (places?.telephone) seen(places.telephone, "on Google");
  for (const p of cell(row, "phones")) seen(p, "from a data provider");
  const emails = new Map();
  for (const e of (facts.email ?? []).map((x) => mailable(x.value)).filter(Boolean)) emails.set(e.toLowerCase(), { value: e, where: ["on their website"] });
  for (const e of cell(row, "emails").map(mailable).filter(Boolean)) if (!emails.has(e.toLowerCase())) emails.set(e.toLowerCase(), { value: e, where: ["from a data provider"] });
  const hours = [
    ...(places?.opening_hours_text?.length ? [{ text: places.opening_hours_text, where: "on Google" }] : []),
    ...(facts.hours ?? []).slice(0, 2).map((h) => ({ text: [safeText(h.value)], where: "on their website" })),
  ];
  const booking = safeUrl((facts.action ?? []).sort((x, y) => (y.score ?? 0) - (x.score ?? 0))[0]?.value);
  return { phones: [...phones.values()].slice(0, 6), emails: [...emails.values()].slice(0, 4), hours, booking };
}

function ratingsOf(facts, places, slug) {
  const out = [];
  const profile = readJson(at("raw", slug, "google", "profile.json"));
  if (profile?.rating) out.push({ platform: "Google", rating: profile.rating, count: profile.count ?? null, url: safeUrl(profile.url), where: "on Google" });
  else if (places?.rating) out.push({ platform: "Google", rating: places.rating, count: places.review_count ?? null, url: safeUrl(places.maps_url), where: "on Google" });
  const all = readJson(at("raw", slug, "reviews", "google.json"));
  if (all?.rating && !out.length) out.push({ platform: "Google", rating: all.rating, count: all.count ?? null, url: "", where: "on Google" });
  const best = (facts.ratings ?? [])[0];
  if (best) out.push({ platform: "Shown on their site", rating: Number(best.value), count: best.count ? Number(best.count) : null, url: safeUrl(best.url), where: "on their website" });
  return out;
}

/** Customers' words we hold, for counting themes. */
function reviewTexts(slug, places) {
  const all = readJson(at("raw", slug, "reviews", "google.json"));
  if (all?.items?.length) return all.items.map((x) => String(x.text ?? ""));
  return (places?.reviews ?? []).map((x) => String(x.quote ?? ""));
}

/** A complaint is shown as a trend or not at all: one unhappy customer doesn't speak for 1,800. */
const isTrend = (t) => t.of >= 50 && t.count != null && t.count >= 5 && t.count / t.of >= 0.05;
const countThemes = (list, texts) =>
  (list ?? []).map((t) => ({
    theme: safeText(t.theme ?? t.name),
    quote: safeText(t.quote),
    source: safeText(t.source),
    count: (t.words ?? []).length ? texts.filter((x) => t.words.some((w) => x.toLowerCase().includes(String(w).toLowerCase()))).length : null,
    of: texts.length,
  }));

/** Pictures at web size in static/media/<company>/; returns each file's address. One that can't be read costs only itself. */
function resized(slug, files, width) {
  const made = new Map();
  for (const f of files) {
    const from = at("raw", slug, f);
    if (!existsSync(from)) continue;
    const to = at("static", "media", slug, dirname(f).replace(/\/images$/, "").replace(/[^a-z0-9/-]/gi, ""));
    const name = basename(from).replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (/\.svg$/i.test(from)) {
      // Opened directly, an SVG runs on this site's address: one that could is left out.
      if (/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(readFileSync(from, "utf8"))) {
        console.error(`build-data: ${slug}: left out ${f}: it holds a script`);
        continue;
      }
      mkdirSync(to, { recursive: true });
      copyFileSync(from, join(to, `${name}.svg`));
      made.set(f, join(to, `${name}.svg`).slice(at("static").length));
      continue;
    }
    const r = spawnSync("python3", [here("web_photos.py"), from, "--as", name, "--to", to, "--width", String(width), "--json"], { encoding: "utf8" });
    const out = [".jpg", ".png"].map((e) => join(to, `${name}${e}`)).find(existsSync);
    if (r.status === 0 && out) made.set(f, out.slice(at("static").length));
    else console.error(`build-data: ${slug}: left out ${f}: ${(r.stderr || "no picture made").trim().split("\n")[0]}`);
  }
  return made;
}

/** Offers we have seen, so a first-seen date outlives the record's rewrites. */
const LEDGER = at(".pipeline", "seen.json");
const ledger = readJson(LEDGER, { offers: {}, companies: {} });
const offersInRecords = new Set();

function offerStatus(offer, blocks) {
  if (offer.ends && String(offer.ends) < TODAY) return { live: false, why: `ended ${offer.ends}` };
  if (offer.corrected) return { live: true };
  const q = squash(offer.quote ?? "");
  const here = blocks.filter((b) => !b.held && b.text.includes(q) && (!offer.url || b.everyPage || sameUrl(b.url) === sameUrl(offer.url)));
  if (!here.length) return { live: false, why: /_ad$/.test(offer.source) ? "the ad is no longer running" : "it is gone from its source" };
  if (/_post$/.test(offer.source) && !offer.ends) {
    const posted = here[0].text.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (posted && Date.parse(TODAY) - Date.parse(posted) > 90 * 86400_000) return { live: false, why: "posted over 90 days ago, with no end date" };
  }
  return { live: true };
}

function buildCompany(row, areas) {
  const slug = row.slug;
  const file = at("records", `${slug}.md`);
  if (!existsSync(file)) return null;
  const parsed = frontMatter(readFileSync(file, "utf8"));
  if (!parsed || parsed.error) return null;
  const d = parsed.data;
  if (d.in_niche === false) return { slug, inNiche: false, name: d.name ?? row.name };

  const siteDir = at("raw", slug, "site");
  const card = readJson(join(siteDir, "_index", "business-card.json"), {});
  const facts = readJson(join(siteDir, "_index", "facts.json"), {});
  const run = readJson(join(siteDir, "_index", "run.json"), {});
  const gathered = readJson(at("raw", slug, "gather.json"), {});
  const places = placesOf(slug);
  const blocks = loadSources(slug);
  const domain = row.domain;
  const crawled = run.finished?.slice(0, 10) ?? "";
  const fetched = gathered.fetched ?? crawled;

  const stamp = (item) => ({ quote: safeText(item.quote), url: safeUrl(item.url), where: item.source && SOURCE_LABELS[item.source] ? SOURCE_LABELS[item.source] : labelFor(item.url, domain), corrected: item.corrected ?? null });

  // Places: every location on its own, each placed by code.
  const locations = cell(row, "locations");
  const placed = locations.map((l) => ({ ...l, address: safeText(l.address), areas: areasAt(areas, l.lat, l.lng).map((x) => x.path) }));

  // What it says it serves, kept apart from where it is based.
  const serves = (d.serves ?? []).map((name) => ({ name: safeText(name), area: areaNamed(areas, String(name))?.path ?? null }));

  // Offers, each with its dates from the ledger.
  const offers = [];
  const retired = [];
  for (const o of d.offers ?? []) {
    const key = `${slug}|${slugify(o.kind)}|${slugify(o.title)}`;
    offersInRecords.add(key);
    const seen = (ledger.offers[key] ??= { first_seen: TODAY, slug, title: safeText(o.title) });
    const status = offerStatus(o, blocks);
    const item = { kind: canon("offer_kinds", o.kind), title: safeText(o.title), ends: o.ends ? String(o.ends) : null, conditions: safeText(o.conditions) ?? null, source: o.source, firstSeen: seen.first_seen, lastSeen: status.live ? fetched || TODAY : seen.last_seen ?? seen.first_seen, ...stamp(o) };
    if (status.live) {
      seen.last_seen = item.lastSeen;
      delete seen.retired;
      offers.push(item);
    } else {
      seen.retired ??= TODAY;
      seen.why = status.why;
      retired.push({ ...item, why: status.why });
    }
  }

  const mediaFiles = (d.media ?? []).filter((m) => m.kind !== "stock" && m.kind !== "logo");
  const logoFile = (d.media ?? []).find((m) => m.kind === "logo")?.file ?? (card.logo?.file ? `site/${card.logo.file}` : null);
  const photos = resized(slug, mediaFiles.map((m) => m.file), 1400);
  const logos = logoFile ? resized(slug, [logoFile], 400) : new Map();
  const texts = reviewTexts(slug, places);
  const contacts = contact(row, card, facts, places);
  const social = profiles([...new Set([...(card.same_as ?? []), ...readJson(at("raw", slug, "matches.json"), []).filter((m) => m.status === "confirmed").map((m) => m.url)])].map(safeUrl));

  // What a customer said, with a star count only where the platform gave one. A company's own pick has none.
  // A few quotes are enough, beside the rating and count.
  const googleReviews = (readJson(at("raw", slug, "reviews", "google.json"))?.items ?? places?.reviews ?? []).slice(0, 5);
  const reviewCards = [
    ...googleReviews.map((x) => ({ quote: safeText(x.text ?? x.quote), who: safeText(x.author ?? x.name), stars: Number(x.rating ?? x.stars) || null, day: x.date ?? null, where: "Google", url: safeUrl(x.url) })),
    ...(d.testimonials ?? []).map((t) => ({ quote: safeText(t.quote), who: safeText(t.who), stars: null, day: null, where: "On their website", url: safeUrl(t.url) })),
  ].filter((x) => x.quote && x.quote.length > 20).slice(0, 12);

  const company = {
    slug,
    name: safeText(d.name ?? row.name),
    pitch: d.pitch?.headline ? { headline: safeText(d.pitch.headline), points: (d.pitch.points ?? []).map((p) => ({ text: safeText(p.text), ...stamp(p) })) , ...stamp(d.pitch) } : null,
    reviewCards,
    leadTo: d.no_leads ? null : contacts.emails[0]?.value ?? null,
    termsUrl: termsPage(slug) ?? [...(d.offers ?? []), ...(d.guarantees ?? [])].find((x) => x.conditions && x.url)?.url ?? null,
    path: `/${slug}`,
    website: safeUrl(row.website),
    domain,
    scope: d.scope ?? "local",
    crawled,
    fetched,
    note: safeText(row.note) || null,
    siteDown: Number(row.site_failures || 0) >= 2,
    leftSource: row.left_source || null,
    ...contacts,
    logo: logoFile ? logos.get(logoFile) ?? null : null,
    photos: mediaFiles.filter((m) => photos.has(m.file)).map((m) => ({ src: photos.get(m.file), kind: m.kind, alt: safeText(m.alt), source: safeUrl(m.url) || safeUrl(row.website), credit: safeText(m.credit) ?? null, creditUrl: safeUrl(m.credit_url) || null })),
    social,
    ratings: ratingsOf(facts, places, slug),
    locations: placed,
    serves,
    servesQuotes: (d.serves_evidence ?? []).map(stamp),
    background: d.background ? { summary: safeText(d.background.summary) ?? null, founded: d.background.founded ?? null, people: (d.background.people ?? []).map((p) => ({ name: safeText(p.name), role: safeText(p.role) })), evidence: (d.background.evidence ?? []).map(stamp) } : null,
    services: (d.services ?? []).map((s) => ({ name: canon("services", s.name), price: safeText(s.price) ?? null, ...stamp(s) })),
    guarantees: (d.guarantees ?? []).map((g) => ({ kind: canon("guarantee_kinds", g.kind), promise: safeText(g.promise) ?? null, length: safeText(g.length) ?? null, covers: safeText(g.covers) ?? null, conditions: safeText(g.conditions) ?? null, whose: g.whose ?? null, ...stamp(g) })),
    offers,
    retiredOffers: retired,
    brands: (d.brands ?? []).map((b) => ({ name: canon("brands", b.name), ...stamp(b) })),
    proof: (d.proof ?? []).map((p) => ({ kind: canon("proof_kinds", p.kind), title: safeText(p.title), ...stamp(p) })),
    details: (d.details ?? []).map((x) => ({ name: x.name, value: safeText(x.value) ?? null, ...stamp(x) })),
    keywords: (d.keywords ?? []).map((k) => canon("keywords", k)),
    testimonials: (d.testimonials ?? []).map((t) => ({ who: safeText(t.who) ?? null, ...stamp(t) })),
    reviews: d.reviews ? { praise: countThemes(d.reviews.praise, texts), complaints: countThemes(d.reviews.complaints, texts).filter(isTrend), services: countThemes(d.reviews.services, texts), read: texts.length } : null,
  };

  // The gate: kinds of real fact, never used to rank.
  const kinds = [company.guarantees.length, company.offers.length, company.services.length, company.proof.length, company.brands.length, company.background?.summary ? 1 : 0].filter(Boolean).length;
  company.factKinds = kinds;
  company.index = kinds >= GATE.company_facts;
  company.indexWhy = company.index ? `${kinds} kinds of fact` : `only ${kinds} kinds of fact, and the gate is ${GATE.company_facts}`;
  ledger.companies[slug] ??= TODAY;
  company.firstSeen = ledger.companies[slug];
  return company;
}

// ---- The build ----

/** The site's one order: companies with a current offer, then the rest, each by name. */
const offersFirst = (x, y) => Number(y.offers.length > 0) - Number(x.offers.length > 0) || x.name.localeCompare(y.name);

const rows = readCompanies().filter((r) => r.state !== "removed");
const areas = loadAreas();
if (existsSync(at("static", "media"))) {
  const live = new Set(rows.map((r) => r.slug));
  for (const d of readdirSync(at("static", "media"))) if (!live.has(d)) rmSync(at("static", "media", d), { recursive: true, force: true });
}
const built = rows.map((r) => buildCompany(r, areas)).filter(Boolean);
// An offer a re-read dropped or retitled has ended, as far as the record goes.
for (const [key, o] of Object.entries(ledger.offers)) if (!offersInRecords.has(key) && built.some((c) => c.slug === o.slug)) o.retired ??= TODAY;
// A picture no record keeps any more stops being served: a takedown has to reach the site.
const keptMedia = new Set(built.flatMap((c) => [c.logo, ...(c.photos ?? []).map((p) => p.src)]).filter(Boolean));
for (const f of walk(at("static", "media"))) if (!keptMedia.has(f.slice(at("static").length))) rmSync(f);
const notNiche = built.filter((c) => c.inNiche === false);
const companies = built.filter((c) => c.inNiche !== false).sort(offersFirst);
if (!companies.length) fail("build-data: no records to build from", "node scripts/pipeline.mjs status");
const total = companies.length;


// One page per company, each its own preview: never open to search, so it never competes
// with the company's own site (the outreach plan's rule).
const allOffers = companies.flatMap((c) => c.offers);
const stats = {
  total,
  built: TODAY,
  niche: site.niche ?? "",
  withOffer: companies.filter((c) => c.offers.length).length,
  withRating: companies.filter((c) => c.ratings.some((r) => r.platform === "Google" && r.count != null)).length,
  withPhotos: companies.filter((c) => c.photos.length).length,
  withWebsite: companies.filter((c) => c.website).length,
};
const pages = companies.map((c) => ({ path: c.path, kind: "company", index: false, ready: c.index, why: c.indexWhy }));

const previous = readJson(at("data", "stats.json"));
const write = (name, value) => writeJson(at("data", `${name}.json`), value);
write("companies", companies);
write("stats", stats);
write("pages", pages);
writeAtomic(LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);

const retiredNow = companies.flatMap((c) => c.retiredOffers).filter((o) => ledger.offers && Object.values(ledger.offers).some((x) => x.retired === TODAY && x.title === o.title));
if (retiredNow.length) log(`retired ${retiredNow.length} offers`, TODAY);
const ready = pages.filter((p) => p.ready).length;
done("build-data", `${total} companies, ${allOffers.length} live offers, ${ready} with enough for a page worth sending`, {
  lines: [
    ...(previous && previous.total !== total ? [`${total - previous.total} more companies than the last build`] : []),
    ...(retiredNow.length ? [`${retiredNow.length} offers retired today`] : []),
    ...(notNiche.length ? [`Left out, not this niche: ${notNiche.map((c) => c.name).join(", ")}`] : []),
    ...(fields.services ? [] : ["fields.yaml lists no services yet: agree them on the sample (tidy-names)"]),
  ],
  next: "npm run check",
});

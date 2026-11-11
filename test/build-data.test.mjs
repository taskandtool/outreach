import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { company, csv, folder } from "./fixture.mjs";

const NOW = "2026-06-15";
const data = (f, name) => JSON.parse(readFileSync(join(f.dir, "data", `${name}.json`), "utf8"));
const square = (name, subtype, west, width = 1) => ({ type: "Feature", properties: { names: { primary: name }, subtype, region: "US-TX", class: "land" }, geometry: { type: "Polygon", coordinates: [[[west, 30], [west + width, 30], [west + width, 31], [west, 31], [west, 30]]] } });

function market() {
  const f = folder();
  f.put("raw/overture/division_area.geojson", { features: [square("Texas", "region", -100, 12), square("Mexico", "country", -100), square("Round Rock", "locality", -98), square("Far Town", "locality", -90)] });
  f.put("companies.csv", csv(
    { slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done", phones: ["5125550100"], locations: [{ address: "1 Main", city: "Round Rock", region: "TX", postcode: "78664", lat: 30.5, lng: -97.5 }] },
    { slug: "best", name: "Bramblewood Air", website: "https://best.example", domain: "best.example", state: "done", phones: ["5125550199"], locations: [{ address: "2 Main", city: "Round Rock", region: "TX", postcode: "78664", lat: 30.6, lng: -97.6 }] },
    { slug: "thin", name: "Thin Co", state: "done", locations: [{ address: "3 Main", city: "Far Town", region: "TX", lat: 30.5, lng: -89.5 }] },
    { slug: "gnatfield", name: "Gnatfield Pest Co", website: "https://gnatfield.example", domain: "gnatfield.example", state: "done" },
    { slug: "gone", name: "Removed Co", state: "removed" },
    { slug: "unread", name: "Not Read Yet", state: "found" },
  ));
  company(f, "acme", "Lifetime labor warranty. $500 off through December. Summer sale. We install Northwind. Full replacement in a day.");
  company(f, "best", "Ten year labor warranty. We install Northwind. Replacement done right.");
  company(f, "thin", "We fix things.");
  f.put("raw/acme/site/_index/facts.json", { phone: [{ value: "(512) 555-0100", sources: [] }, { value: "(512) 555-0111", sources: [] }], email: [], hours: [], action: [], ratings: [{ value: "5.0", count: "300", url: "https://acme.example/" }] });
  f.put("raw/acme/places/x.summary.json", { rating: 4.7, review_count: 80, maps_url: "https://maps.google.com/?cid=1", telephone: "(512) 555-0222", opening_hours_text: ["Monday: 8 to 5"], reviews: [{ quote: "They were on time and kind" }, { quote: "Late and rude" }] });
  f.put("records/acme.md", `---
name: Acme <script>alert(1)</script>
serves: [Far Town, Nowhere]
serves_evidence: [{ quote: "We fix", url: "https://acme.example/" }]
guarantees:
  - { kind: labor, length: lifetime, whose: company, quote: "Lifetime labor warranty", url: "https://acme.example/" }
services:
  - { name: replacement, quote: "Full replacement in a day", url: "https://acme.example/", price: "from $4,000" }
offers:
  - { kind: discount, title: "$500 off", ends: "2026-12-31", source: site, quote: "$500 off through December", url: "https://acme.example/" }
  - { kind: discount, title: "Spring sale", ends: "2026-04-01", source: site, quote: "Summer sale", url: "https://acme.example/" }
  - { kind: discount, title: "Gone from the page", source: site, quote: "This is no longer anywhere", url: "https://acme.example/" }
brands:
  - { name: Northwind Industries, quote: "We install Northwind", url: "https://acme.example/" }
keywords: [same-day install]
reviews:
  praise: [{ theme: on time, quote: "They were on time", source: google, words: [on time, punctual] }]
---
A private note that should never reach a page, not even once.
`);
  f.put("records/best.md", `---
name: Bramblewood Air
guarantees:
  - { kind: labor, length: 10 years, quote: "Ten year labor warranty", url: "https://best.example/" }
services:
  - { name: replacement, quote: "Replacement done right", url: "https://best.example/" }
brands:
  - { name: Northwind, quote: "We install Northwind", url: "https://best.example/" }
---
`);
  f.put("records/thin.md", "---\nname: Thin Co\n---\n");
  f.put("records/gnatfield.md", "---\nname: Gnatfield Pest Co\nin_niche: false\nbackground: { summary: Sprays mosquitoes. }\n---\n");
  f.put("records/gone.md", "---\nname: Removed Co\n---\n");
  f.put("aliases.yaml", "brands:\n  Northwind Industries: Northwind\n");
  return f;
}

test("the whole build, against a pinned day", async () => {
  const f = market();
  const r = await f.run("build-data.mjs", ["--today", NOW]);
  assert.equal(r.status, 0, r.stderr);
  const companies = data(f, "companies");
  const names = companies.map((c) => c.slug);
  assert.deepEqual(names.sort(), ["acme", "best", "thin"], "removed, out-of-niche and unread companies stay out");
  assert.match(r.stdout, /Left out, not this niche: Gnatfield Pest Co/);

  const acme = companies.find((c) => c.slug === "acme");
  assert.equal(acme.name.includes("<"), false, "a name loses its angle brackets");
  assert.deepEqual(acme.offers.map((o) => o.title), ["$500 off"], "ended and vanished offers are not current");
  const why = Object.fromEntries(acme.retiredOffers.map((o) => [o.title, o.why]));
  assert.match(why["Spring sale"], /ended 2026-04-01/);
  assert.match(why["Gone from the page"], /gone from its source/);
  assert.equal(acme.offers[0].firstSeen, NOW);

  assert.equal(acme.phones.length, 3, "two values stay two, each with where it was seen");
  assert.deepEqual(acme.phones.find((p) => p.value === "(512) 555-0222").where, ["on Google"]);
  assert.deepEqual(acme.ratings.map((x) => x.platform), ["Google", "Shown on their site"], "ratings are never merged");
  assert.equal(acme.reviews.praise[0].count, 1, "code counts the reviews");
  assert.equal(acme.reviews.praise[0].of, 2);

  assert.deepEqual(acme.serves, [{ name: "Far Town", area: "/areas/tx/far-town" }, { name: "Nowhere", area: null }], "a place with no boundary stays text");
  assert.equal(acme.brands[0].name, "Northwind", "aliases merge spellings");

  const pages = Object.fromEntries(data(f, "pages").map((p) => [p.path, p]));
  assert.deepEqual(Object.keys(pages).sort(), ["/acme", "/best", "/thin"], "one page per company, at /<slug>");
  assert.ok(Object.values(pages).every((p) => p.index === false), "a preview never opens to search");
  assert.equal(pages["/acme"].ready, true);
  assert.equal(pages["/thin"].ready, false, "a name and an address is not a page worth sending");
  assert.match(r.stdout, /2 with enough for a page worth sending/);
});

test("an offer's first-seen date outlives a rebuild, and it retires on the day it passes", async () => {
  const f = market();
  await f.run("build-data.mjs", ["--today", NOW]);
  await f.run("build-data.mjs", ["--today", "2027-01-05"]);
  const acme = data(f, "companies").find((c) => c.slug === "acme");
  assert.deepEqual(acme.offers, []);
  const retired = acme.retiredOffers.find((o) => o.title === "$500 off");
  assert.equal(retired.firstSeen, NOW);
  assert.ok(existsSync(join(f.dir, ".pipeline", "seen.json")));
});

test("a running ad retires when it leaves the ad library", async () => {
  const f = market();
  f.put("raw/best/ads/facebook.md", "## Running since 2026-06-01\nurl: https://www.facebook.com/ads/library/?id=7\n\nFree tune-up this month\n");
  f.put("records/best.md", '---\nname: Bramblewood Air\noffers:\n  - { kind: discount, title: Free tune-up, source: facebook_ad, quote: "Free tune-up this month", url: "https://www.facebook.com/ads/library/?id=7" }\n---\n');
  await f.run("build-data.mjs", ["--today", NOW]);
  assert.equal(data(f, "companies").find((c) => c.slug === "best").offers[0].where, "running as a Facebook ad");
  f.put("raw/best/ads/facebook.md", "");
  await f.run("build-data.mjs", ["--today", NOW]);
  assert.equal(data(f, "companies").find((c) => c.slug === "best").retiredOffers.find((o) => o.title === "Free tune-up").why, "the ad is no longer running");
});

test("an unsafe link in a record never reaches the data", async () => {
  const f = market();
  f.put("records/thin.md", '---\nname: Thin Co\nservices:\n  - { name: repair, quote: "We fix things", url: "javascript:alert(1)" }\n---\n');
  await f.run("build-data.mjs", ["--today", NOW]);
  assert.equal(data(f, "companies").find((c) => c.slug === "thin").services[0].url, "");
});

test("a kept picture reaches the page, a crawl's hash in its name or not; one that can't be read costs only itself", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done" }));
  company(f, "acme", "We fix things.");
  mkdirSync(join(f.dir, "raw/acme/site/images"), { recursive: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  writeFileSync(join(f.dir, "raw/acme/site/images/team-1-ebbc967b.png"), png);
  writeFileSync(join(f.dir, "raw/acme/site/images/team-1-aaaa1111.png"), png);
  writeFileSync(join(f.dir, "raw/acme/site/images/broken-bbbb2222.png"), "not a picture");
  f.put("records/acme.md", `---
name: Acme
media:
  - { file: site/images/team-1-ebbc967b.png, kind: team, alt: The crew, url: "https://acme.example/" }
  - { file: site/images/team-1-aaaa1111.png, kind: team, alt: The van, url: "https://acme.example/" }
  - { file: site/images/broken-bbbb2222.png, kind: work, alt: A unit, url: "https://acme.example/" }
---
`);
  const r = await f.run("build-data.mjs", ["--today", NOW]);
  assert.equal(r.status, 0, r.stderr);
  const photos = data(f, "companies")[0].photos;
  assert.deepEqual(photos.map((p) => p.alt), ["The crew", "The van"]);
  for (const p of photos) assert.ok(existsSync(join(f.dir, "static", p.src)), p.src);
  assert.notEqual(photos[0].src, photos[1].src);
  assert.match(r.stderr, /left out site\/images\/broken/);
});

test("a picture no record keeps is no longer served, and an SVG that could run is left out", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done" }));
  company(f, "acme", "We fix things.");
  f.put("raw/acme/site/images/mark.svg", "<svg xmlns='http://www.w3.org/2000/svg'></svg>");
  f.put("raw/acme/site/images/bad.svg", "<svg onload='alert(1)'></svg>");
  const record = (lines) => f.put("records/acme.md", `---\nname: Acme\nmedia:\n${lines}---\n`);
  record("  - { file: site/images/mark.svg, kind: team, alt: A mark, url: 'https://acme.example/' }\n  - { file: site/images/bad.svg, kind: team, alt: Bad, url: 'https://acme.example/' }\n");
  assert.equal((await f.run("build-data.mjs", ["--today", NOW])).status, 0);
  const photos = data(f, "companies")[0].photos;
  assert.deepEqual(photos.map((p) => p.alt), ["A mark"]);
  f.put("records/acme.md", "---\nname: Acme\n---\n");
  assert.equal((await f.run("build-data.mjs", ["--today", NOW])).status, 0);
  assert.ok(!existsSync(join(f.dir, "static", photos[0].src)));
});

test("an offer a re-read dropped has ended", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done" }));
  company(f, "acme", "$500 off a new system. Now $600 off a new system.");
  const offer = (title, quote) => f.put("records/acme.md", `---\nname: Acme\noffers:\n  - { kind: discount, title: "${title}", source: site, quote: "${quote}", url: "https://acme.example/" }\n---\n`);
  offer("$500 off", "$500 off a new system");
  await f.run("build-data.mjs", ["--today", NOW]);
  offer("$600 off", "$600 off a new system");
  await f.run("build-data.mjs", ["--today", NOW]);
  const c = data(f, "companies")[0];
  assert.deepEqual(c.offers.map((o) => o.title), ["$600 off"]);
  const ledger = JSON.parse(readFileSync(join(f.dir, ".pipeline", "seen.json"), "utf8"));
  assert.equal(Object.values(ledger.offers).find((o) => o.title === "$500 off").retired, NOW);
});

test("junk contact details never become links", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done", phones: ["2055", "15125550123"], emails: ["info@acme.example:+15125550100", "Hi@acme.example%20"] }));
  company(f, "acme", "We fix things.");
  f.put("records/acme.md", "---\nname: Acme\n---\n");
  await f.run("build-data.mjs", ["--today", NOW]);
  const c = data(f, "companies")[0];
  assert.ok(c.phones.every((p) => p.value.replace(/\D/g, "").length === 10));
  assert.ok(c.phones.some((p) => p.value === "(512) 555-0123"));
  assert.deepEqual(c.emails.map((e) => e.value), ["Hi@acme.example"]);
});

test("a company page gets its pitch, real review cards and a lead address, and only its own profiles", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done", emails: ["hi@acme.example"] }));
  company(f, "acme", "Lifetime labor warranty.", { card: { same_as: ["https://www.facebook.com/acme", "https://facebook.com/other", "https://facebook.com/policy.php", "https://www.northwind.example/dealer", "https://x.com/acme", "https://parcelco.example/acme"] } });
  f.put("raw/acme/places/x.summary.json", { rating: 4.5, review_count: 9, reviews: [{ quote: "They came the same day and fixed it fast.", name: "Ann", stars: "5", date: "2026-01-02" }] });
  f.put("records/acme.md", `---
name: Acme
pitch:
  headline: Lifetime labor warranty
  quote: "Lifetime labor warranty"
  url: "https://acme.example/"
  points: [{ text: Lifetime labor, quote: "Lifetime labor warranty", url: "https://acme.example/" }]
testimonials: [{ quote: "Their pick of what a customer wrote.", who: Bo, url: "https://acme.example/" }]
---
`);
  assert.equal((await f.run("build-data.mjs", ["--today", NOW])).status, 0);
  const c = data(f, "companies")[0];
  assert.equal(c.pitch.headline, "Lifetime labor warranty");
  assert.deepEqual(c.reviewCards.map((r) => [r.who, r.stars]), [["Ann", 5], ["Bo", null]], "a company's own pick has no stars");
  assert.equal(c.leadTo, "hi@acme.example");
  assert.deepEqual(c.social, ["https://www.facebook.com/acme", "https://x.com/acme"]);
  f.put("records/acme.md", "---\nname: Acme\nno_leads: true\n---\n");
  await f.run("build-data.mjs", ["--today", NOW]);
  assert.equal(data(f, "companies")[0].leadTo, null, "a business that asked out gets none");
});

test("terms link to the site's terms page, else its warranty page, else the source of a term; a post about terms is neither", async () => {
  const build = async (urls, record = "") => {
    const f = folder();
    f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done" }));
    company(f, "acme", "Lifetime labor warranty with any plan.");
    f.put("raw/acme/site/_index/inventory.json", { records: urls.map((url) => ({ url })) });
    f.put("records/acme.md", `---\nname: Acme\n${record}---\n`);
    assert.equal((await f.run("build-data.mjs", ["--today", NOW])).status, 0);
    return data(f, "companies")[0].termsUrl;
  };
  assert.equal(await build(["https://acme.example/ac-terms-you-need", "https://acme.example/hvac-warranties", "https://acme.example/terms-and-conditions/"]), "https://acme.example/terms-and-conditions/");
  assert.equal(await build(["https://acme.example/ac-terms-you-need", "https://acme.example/hvac-warranties"]), "https://acme.example/hvac-warranties");
  assert.equal(await build(["https://acme.example/ac-terms-you-need"], 'guarantees:\n  - { kind: labor, conditions: any plan, quote: "Lifetime labor warranty", url: "https://acme.example/" }\n'), "https://acme.example/");
  assert.equal(await build([]), null);
});

test("a complaint shows as a trend or not at all", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done" }));
  company(f, "acme", "We fix things.");
  const items = (late) => Array.from({ length: 60 }, (_, i) => ({ text: i < late ? "They were late and never called." : "Great work, fair price.", rating: 5, date: "2026-01-02" }));
  const reviews = 'reviews:\n  praise: [{ theme: quality, words: [great] }]\n  complaints: [{ theme: lateness, quote: "They were late", source: google, words: [late] }]\n';
  f.put("records/acme.md", `---\nname: Acme\n${reviews}---\n`);
  const build = async (late) => {
    f.put("raw/acme/reviews/google.json", { items: items(late) });
    assert.equal((await f.run("build-data.mjs", ["--today", NOW])).status, 0);
    return data(f, "companies")[0].reviews.complaints.map((t) => t.theme);
  };
  assert.deepEqual(await build(2), [], "two of sixty is not a trend");
  assert.deepEqual(await build(8), ["lateness"], "eight of sixty is");
});

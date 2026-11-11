// The vendors' answers as their docs show them, from a fake gateway: which profiles
// count as the company, what gets saved, and that a stopped vendor stops cleanly.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { company, csv, folder } from "./fixture.mjs";

const PROFILE = { id: "99", name: "Acme", url: "https://www.facebook.com/acme", website: "https://acme.example", phone: "(512) 555-0100", pageIntro: "We fix air", followerCount: 10 };
const ANSWERS = {
  "/v1/facebook/profile": PROFILE,
  "/v1/facebook/profile/photos": { photos: [] },
  "/v1/facebook/profile/posts": { posts: [{ text: "$100 off this month", publishTime: 1767225600, url: "https://facebook.com/post/1" }] },
  "/v1/facebook/adLibrary/company/ads": { results: [{ ad_archive_id: "7", start_date: 1767225600, is_active: true, snapshot: { body: { text: "Free tune-up" }, link_url: "https://acme.example", images: [] } }] },
  "/v1/google/company/ads": { ads: [{ adUrl: "https://adstransparency.google.com/advertiser/A/creative/C", firstShown: "2026-01-01T00:00:00.000Z", lastShown: "2026-02-01T00:00:00.000Z", imageUrl: null }] },
  "/v1/instagram/profile": { data: { user: { external_url: "https://elsewhere.example", biography: "Someone else" } } },
};

function gateway(answers = ANSWERS, status = 200) {
  const calls = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const m = u.pathname.match(/^\/api\/machine\/gateway\/([^/]+)(\/.*)$/);
    if (m[1] === undefined) return res.writeHead(404).end();
    calls.push(`${m[2]}${u.search}`);
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(answers[m[2]] ?? {}));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ calls, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

/** A bridge that says what this app holds. */
function bridge(f, provider = "scrapecreators") {
  const file = join(f.dir, "bridge.py");
  writeFileSync(file, `import json,sys\nif sys.argv[1]=="list-connections": print(json.dumps({"ok":True,"connections":[{"provider":"${provider}","slug":"${provider}","gateway_url":"x","status":"active"}]}))\nelse: print(json.dumps({"ok":True}))\n`);
  return file;
}

function setup(f) {
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "crawled", phones: ["5125550100"], socials: ["https://www.instagram.com/someoneelse"] }));
  company(f, "acme", "We fix air.", { card: { same_as: ["https://www.facebook.com/acme"] } });
}

test("gather saves what a confirmed profile gives, holds one that proves nothing, and previews first", async (t) => {
  const f = folder();
  setup(f);
  const g = await gateway();
  t.after(g.close);
  const env = { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f) };

  const preview = await f.run("companies.mjs", ["gather"], env);
  assert.match(preview.stdout, /10 ScrapeCreators credits at most/);
  assert.match(preview.stdout, /Nothing was spent/);
  assert.equal(g.calls.length, 0, "no call without --confirm");

  const r = await f.run("companies.mjs", ["gather", "--confirm"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /held for a person: instagram/);
  const matches = JSON.parse(readFileSync(join(f.dir, "raw/acme/matches.json"), "utf8"));
  assert.equal(matches.find((m) => m.network === "facebook").status, "confirmed");
  assert.match(matches.find((m) => m.network === "facebook").why, /site links to it/);
  assert.equal(matches.find((m) => m.network === "instagram").status, "held");
  assert.ok(!existsSync(join(f.dir, "raw/acme/instagram/profile.md")), "nothing from a held profile is kept");

  assert.match(readFileSync(join(f.dir, "raw/acme/facebook/posts.md"), "utf8"), /\$100 off this month/);
  assert.match(readFileSync(join(f.dir, "raw/acme/ads/facebook.md"), "utf8"), /ads\/library\/\?id=7/);
  assert.ok(g.calls.some((c) => c.startsWith("/v1/facebook/adLibrary/company/ads?pageId=99")), "ads are looked up by the confirmed page's id");
  assert.ok(g.calls.some((c) => c === "/v1/google/company/ads?domain=acme.example&region=US"));

  const before = g.calls.length;
  await f.run("companies.mjs", ["gather", "--confirm", "--company", "acme"], env);
  assert.ok(g.calls.filter((c) => c.startsWith("/v1/facebook/profile/posts")).length === 1, "never paid for twice");
  assert.ok(g.calls.length - before <= 1, "only the held profile's check is skipped too");
});

test("a person's decision in matches.json stands", async (t) => {
  const f = folder();
  setup(f);
  f.put("raw/acme/matches.json", [{ network: "instagram", url: "https://www.instagram.com/someoneelse", status: "rejected", why: "a person said so" }]);
  const g = await gateway();
  t.after(g.close);
  await f.run("companies.mjs", ["gather", "--confirm"], { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f) });
  assert.equal(g.calls.some((c) => c.includes("instagram")), false);
});

test("a vendor out of credits stops for the day, keeps progress, and the company waits for it", async (t) => {
  const f = folder();
  setup(f);
  const g = await gateway(ANSWERS, 402);
  t.after(g.close);
  const r = await f.run("companies.mjs", ["gather", "--confirm"], { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /stopped scrapecreators for today: scrapecreators answered 402/);
  assert.equal(g.calls.length, 1, "no second call to a stopped vendor");
  assert.ok(existsSync(join(f.dir, ".pipeline/stopped.json")));
  assert.match(readFileSync(join(f.dir, "companies.csv"), "utf8"), /,crawled,/, "a read now would miss what the vendor still has");
});

test("no connections: nothing to gather, and the site alone carries on", async () => {
  const f = folder();
  setup(f);
  const r = await f.run("companies.mjs", ["gather", "--confirm"], { GOOGLE_PLACES_API_KEY: "" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nothing beyond its site/);
});

/** DataForSEO's business profile, as its docs show it, found by name near the company. */
const listing = (item) => ({
  "/v3/business_data/google/my_business_info/task_post": { tasks: [{ id: "T1", status_code: 20100 }] },
  "/v3/business_data/google/my_business_info/task_get/T1": { tasks: [{ status_code: 20000, result: [{ items: [item] }] }] },
});

test("Google's rating comes from DataForSEO, kept only when the listing is the company's", async (t) => {
  for (const [item, kept] of [
    [{ title: "Acme", url: "https://acme.example/", domain: "acme.example", phone: "+1512-555-0199", rating: { value: 4.8, votes_count: 120 }, cid: "123" }, true],
    [{ title: "Acme Pools", url: "https://acmepools.example/", domain: "acmepools.example", phone: "+1512-555-0199", rating: { value: 3.1, votes_count: 9 }, cid: "456" }, false],
  ]) {
    const f = folder();
    f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "crawled", phones: ["5125550100"], locations: [{ city: "Austin", lat: 30.27, lng: -97.74 }] }));
    company(f, "acme", "We fix air.");
    const g = await gateway(listing(item));
    t.after(g.close);
    const r = await f.run("companies.mjs", ["gather", "--confirm"], { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f, "dataforseo"), GOOGLE_PLACES_API_KEY: "" });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(g.calls.some((c) => c.endsWith("/task_post")), "one task, by name near the company");
    const file = join(f.dir, "raw/acme/google/profile.json");
    if (kept) {
      const p = JSON.parse(readFileSync(file, "utf8"));
      assert.deepEqual([p.rating, p.count, p.url], [4.8, 120, "https://maps.google.com/?cid=123"]);
      assert.match(p.why, /website is acme.example/);
    } else {
      assert.ok(!existsSync(file), "another business's rating is never kept");
      assert.match(JSON.parse(readFileSync(join(f.dir, "raw/acme/gather.json"), "utf8")).sources["google profile"].why, /acmepools.example/);
    }
  }
});

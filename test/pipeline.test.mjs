import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { company, csv, folder } from "./fixture.mjs";

const states = (f) => Object.fromEntries(readFileSync(join(f.dir, "companies.csv"), "utf8").trim().split("\n").slice(1).map((l) => [l.split(",")[0], l.split(",").find((x) => ["found", "queued", "crawled", "ready", "claimed", "done", "failed", "removed"].includes(x))]));

function queue() {
  const f = folder();
  f.put("companies.csv", csv(
    { slug: "a", name: "A", website: "https://a.example", domain: "a.example", state: "ready", locations: [{ city: "X" }] },
    { slug: "b", name: "B", website: "https://b.example", domain: "b.example", state: "ready" },
    { slug: "c", name: "C", website: "https://c.example", domain: "c.example", state: "found", locations: [{ city: "X" }, { city: "Y" }] },
    { slug: "d", name: "D", website: "https://d.example", domain: "d.example", state: "found" },
    { slug: "e", name: "E", state: "found" },
  ));
  return f;
}

test("two runs at once never claim the same company", async () => {
  const f = queue();
  const [x, y] = await Promise.all([f.run("pipeline.mjs", ["next", "company", "--json"]), f.run("pipeline.mjs", ["next", "company", "--json"])]);
  assert.notEqual(JSON.parse(x.stdout).slug, JSON.parse(y.stdout).slug);
  const none = await f.run("pipeline.mjs", ["next", "company"]);
  assert.equal(none.status, 0);
  assert.match(none.stdout, /nothing left/);
});

test("done refuses a record that fails its checks, and passes one that doesn't", async () => {
  const f = queue();
  await f.run("pipeline.mjs", ["next", "company"]);
  company(f, "a", "Lifetime labor warranty.");
  f.put("records/a.md", '---\nname: A\nguarantees:\n  - { kind: labor, quote: "Invented words", url: "https://a.example/" }\n---\n');
  const bad = await f.run("pipeline.mjs", ["done", "company", "a"]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /quote not found/);
  assert.equal(states(f).a, "claimed");
  f.put("records/a.md", '---\nname: A\nguarantees:\n  - { kind: labor, quote: "Lifetime labor warranty", url: "https://a.example/" }\n---\n');
  const good = await f.run("pipeline.mjs", ["done", "company", "a"]);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(states(f).a, "done");
});

test("three failures leave a company for a person, and the rest carry on", async () => {
  const f = queue();
  for (let i = 0; i < 3; i++) {
    const r = JSON.parse((await f.run("pipeline.mjs", ["next", "company", "--json"])).stdout);
    assert.equal(r.slug, "a");
    await f.run("pipeline.mjs", ["retry", "company", "a", "--why", "the quotes will not trace"]);
  }
  assert.equal(states(f).a, "failed");
  assert.equal(JSON.parse((await f.run("pipeline.mjs", ["next", "company", "--json"])).stdout).slug, "b");
  const status = await f.run("pipeline.mjs", ["status"]);
  assert.match(status.stdout, /failed: a: the quotes will not trace/);
});

test("the sample takes companies with sites, large ones first; queuing all leaves none found", async () => {
  const f = queue();
  const r = await f.run("pipeline.mjs", ["queue", "--sample", "1"]);
  assert.match(r.stdout, /C \(2 locations/);
  assert.equal(states(f).c, "queued");
  assert.equal(states(f).d, "found");
  await f.run("pipeline.mjs", ["queue", "--all"]);
  assert.equal(states(f).d, "queued");
  assert.equal(states(f).e, "queued", "a company with no site is listed from its other sources");
});

test("tick is safe when nothing is pending, and says so", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "a", name: "A", state: "done" }));
  const r = await f.run("pipeline.mjs", ["tick"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nothing left to do/);
});

test("upkeep previews and spends nothing without --confirm", async () => {
  const f = queue();
  const r = await f.run("pipeline.mjs", ["upkeep"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Nothing was scheduled/);
});

test("a command that fails while holding the lock lets it go", async () => {
  const f = queue();
  const r = await f.run("pipeline.mjs", ["queue", "--company", "nobody"]);
  assert.equal(r.status, 1);
  assert.ok(!existsSync(join(f.dir, ".pipeline/lock")));
});

test("a run that dies without saying so gets three tries, then waits for a person", async () => {
  const f = folder();
  const long = new Date(Date.now() - 3 * 3600_000).toISOString();
  f.put("companies.csv", csv({ slug: "a", name: "A", state: "claimed", claimed_at: long, tries: "3" }, { slug: "b", name: "B", state: "claimed", claimed_at: long, tries: "1" }));
  const r = await f.run("pipeline.mjs", ["next", "company", "--json"]);
  assert.equal(JSON.parse(r.stdout).slug, "b");
  assert.equal(states(f).a, "failed");
});

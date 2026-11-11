import { test } from "node:test";
import assert from "node:assert/strict";
import { company, csv, folder } from "./fixture.mjs";

function setup(record) {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "claimed" }));
  company(f, "acme", "Lifetime **labor** warranty with any\nmaintenance plan. $500 off a new system through December.");
  f.put("records/acme.md", `---\n${record}\n---\n`);
  return f;
}

test("a quote from the source passes, whatever its case, spacing or markdown", async () => {
  const f = setup('name: Acme\nguarantees:\n  - { kind: labor, length: lifetime, quote: "lifetime labor warranty with any maintenance plan", url: "https://acme.example/" }');
  const r = await f.run("check-record.mjs", ["acme"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /every quote traced/);
});

test("an invented quote, a wrong url, a bad kind and a contact field each fail and say what to do", async () => {
  const f = setup('name: Acme\nphone: "555"\nguarantees:\n  - { kind: labor, quote: "We guarantee everything forever", url: "https://acme.example/" }\n  - { kind: labor, quote: "Lifetime labor warranty", url: "https://acme.example/other" }\n  - { kind: magic, quote: "Lifetime labor warranty", url: "https://acme.example/" }');
  const r = await f.run("check-record.mjs", ["acme"]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /quote not found/);
  assert.match(r.stderr, /is not at https:\/\/acme.example\/other: it appears at https:\/\/acme.example\//);
  assert.match(r.stderr, /"magic" is not in fields.yaml's guarantee_kinds/);
  assert.match(r.stderr, /filled in by script/);
  assert.match(r.stderr, /Try: /);
});

test("a bad date, a missing picture, stock, and a count written by hand each fail", async () => {
  const f = setup('name: Acme\noffers:\n  - { kind: discount, title: "$500 off", ends: "December", source: site, quote: "$500 off a new system", url: "https://acme.example/" }\nmedia:\n  - { file: site/images/none.jpg, kind: stock, alt: A van, url: "https://acme.example/" }\nreviews:\n  praise:\n    - { theme: on time, quote: "$500 off a new system", count: 41 }');
  const r = await f.run("check-record.mjs", ["acme"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /"December" is not a date/);
  assert.match(r.stderr, /does not exist/);
  assert.match(r.stderr, /is stock/);
  assert.match(r.stderr, /code does the counting/);
});

test("words from a held profile can't be used", async () => {
  const f = setup('name: Acme\nguarantees:\n  - { kind: labor, quote: "Satisfaction promised on Facebook", url: "https://facebook.com/x" }');
  f.put("raw/acme/facebook/posts.md", "## 2026-01-01\nurl: https://facebook.com/x\n\nSatisfaction promised on Facebook\n");
  f.put("raw/acme/matches.json", [{ network: "facebook", url: "https://facebook.com/x", status: "held", why: "nothing ties it" }]);
  const r = await f.run("check-record.mjs", ["acme"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /does not confirm/);
});

test("a correction by the business needs no quote", async () => {
  const f = setup("name: Acme\nguarantees:\n  - { kind: labor, length: 5 years, corrected: 2026-02-01 }");
  assert.equal((await f.run("check-record.mjs", ["acme"])).status, 0);
});

test("a quote from the text every page repeats may cite any page", async () => {
  const f = setup('name: Acme\nproof:\n  - { kind: license, title: TACLB1, quote: "License: TACLB1", url: "https://acme.example/" }');
  f.put("raw/acme/site/_index/common.md", "Menu\nLicense: TACLB1\n");
  const r = await f.run("check-record.mjs", ["acme"]);
  assert.equal(r.status, 0, r.stderr);
});

test("an extracted document uses its source URL and rejects a different URL", async () => {
  const record = 'name: Acme\nproof:\n  - { kind: license, title: TACLA123, quote: "License TACLA123", url: "https://acme.example/resume.pdf" }';
  const f = setup(record);
  f.put("raw/acme/site/docs/resume.md", "<!-- source: https://acme.example/resume.pdf -->\n<!-- linked from: https://acme.example/about -->\n\n## Company information\nLicense TACLA123\n");
  const valid = await f.run("check-record.mjs", ["acme"]);
  assert.equal(valid.status, 0, valid.stderr);
  f.put("records/acme.md", `---\n${record.replace("https://acme.example/resume.pdf", "https://acme.example/about")}\n---\n`);
  const invalid = await f.run("check-record.mjs", ["acme"]);
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /quote is not at https:\/\/acme.example\/about/);
});

test("a Google listing held for a person can't be quoted", async () => {
  const f = setup('name: Acme\nguarantees:\n  - { kind: labor, quote: "Promised on the listing", url: "https://maps.google.com/x" }');
  f.put("raw/acme/places/x.md", "url: https://maps.google.com/x\n\nPromised on the listing\n");
  f.put("raw/acme/gather.json", { sources: { "google listing": { status: "held" } } });
  const r = await f.run("check-record.mjs", ["acme"]);
  assert.equal(r.status, 1);
});

test("a date that doesn't exist is refused", async () => {
  const f = setup('name: Acme\noffers:\n  - { kind: discount, title: "$500 off", ends: "2026-02-31", source: site, quote: "$500 off a new system", url: "https://acme.example/" }');
  const r = await f.run("check-record.mjs", ["acme"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not a date/);
});

test("a pitch must trace to a quote, and stay short", async () => {
  const f = setup('name: Acme\npitch:\n  headline: The best and most trusted heating company in the whole of Texas today\n  quote: "We are the best"\n  url: "https://acme.example/"');
  const r = await f.run("check-record.mjs", ["acme"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /quote not found/);
  assert.match(r.stderr, /keep it to 12/);
});

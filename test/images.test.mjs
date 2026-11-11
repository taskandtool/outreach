// A picture is looked at once. Code drops what it can, and the words outlive the look.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { company, csv, folder } from "./fixture.mjs";

const DRAW = `
import sys
from PIL import Image, ImageDraw
out, w, h, seed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
im = Image.new("RGB", (w, h), "white"); d = ImageDraw.Draw(im)
for i in range(8):
    x = (seed * (i + 3) * 37) % w; y = (seed * (i + 5) * 53) % h
    d.rectangle((x, y, x + w // 4, y + h // 4), fill=((seed * 40 + i * 20) % 255, (i * 60) % 255, (seed * 90) % 255))
im.save(out)
`;

function setup() {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", state: "done" }));
  company(f, "acme", "We fix things.");
  f.put("records/acme.md", "---\nname: Acme\nmedia:\n  - { file: site/images/old.png, kind: work, alt: Old, url: https://acme.example/ }\nkeywords: [fast]\n---\n\nThe body stays.\n");
  const dir = join(f.dir, "raw/acme/site/images");
  mkdirSync(dir, { recursive: true });
  const draw = (name, w, h, seed) => execFileSync("python3", ["-c", DRAW, join(dir, name), String(w), String(h), String(seed)]);
  draw("crew.png", 800, 600, 1);
  execFileSync("python3", ["-c", `from PIL import Image; Image.open(${JSON.stringify(join(dir, "crew.png"))}).resize((400, 300)).save(${JSON.stringify(join(dir, "crew-small.png"))})`]);
  draw("stock.png", 800, 600, 7);
  draw("job.png", 800, 600, 4);
  draw("icon.png", 64, 64, 2);
  writeFileSync(join(dir, "old.png"), readFileSync(join(dir, "job.png")));
  return f;
}

test("code drops tiny pictures and near-copies; each is described once; apply writes only media", async () => {
  const f = setup();
  const next = await f.run("images.mjs", ["next", "acme", "--count", "9"]);
  assert.equal(next.status, 0, next.stderr);
  assert.match(next.stdout, /crew\.png/);
  assert.doesNotMatch(next.stdout, /crew-small|icon/);
  const store = () => JSON.parse(readFileSync(join(f.dir, "raw/acme/images.json"), "utf8")).pictures;
  assert.match(store().find((p) => p.file === "crew-small.png").skip, /same as crew\.png/);
  assert.equal(store().find((p) => p.file === "icon.png").skip, "tiny");

  const said = { "crew.png": ["The crew by a van", "team", true], "stock.png": ["A stock family", "stock", false], "job.png": ["A new unit", "work", true], "old.png": ["A new unit", "work", true] };
  const names = store().filter((p) => !p.skip).map((p) => p.file);
  f.put("answers.json", names.map((n) => ({ file: n, what: said[n][0], kind: said[n][1], own: said[n][2] })));
  const saved = await f.run("images.mjs", ["save", "acme", "--file", join(f.dir, "answers.json")]);
  assert.equal(saved.status, 0, saved.stderr);
  const again = await f.run("images.mjs", ["next", "acme"]);
  assert.match(again.stdout, /all described/, "nothing is looked at twice");

  assert.equal((await f.run("images.mjs", ["apply", "acme"])).status, 0);
  const text = readFileSync(join(f.dir, "records/acme.md"), "utf8");
  assert.match(text, /keywords: \[fast\]/);
  assert.match(text, /The body stays/);
  assert.match(text, /The crew by a van/);
  assert.doesNotMatch(text, /stock family|alt: Old/);
  assert.ok(text.indexOf("crew.png") < text.indexOf("job.png"), "people first");

  assert.equal((text.match(/A new unit/g) ?? []).length, 1, "two described alike are one");
  assert.equal((await f.run("images.mjs", ["hide", "acme", "crew.png"])).status, 0);
  await f.run("images.mjs", ["apply", "acme"]);
  assert.doesNotMatch(readFileSync(join(f.dir, "records/acme.md"), "utf8"), /crew\.png/);
  const check = await f.run("check-record.mjs", ["acme"]);
  assert.equal(check.status, 0, check.stderr);
});

test("an answer without a kind saves nothing and says why; apply waits for every description", async () => {
  const f = setup();
  await f.run("images.mjs", ["next", "acme"]);
  f.put("answers.json", [{ n: 1, what: "Something", kind: "nope", own: true }]);
  const bad = await f.run("images.mjs", ["save", "acme", "--file", join(f.dir, "answers.json")]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /needs what, a kind/);
  const early = await f.run("images.mjs", ["apply", "acme"]);
  assert.equal(early.status, 1);
  assert.match(early.stderr, /not described yet/);
});

test("apply handles media however the record wrote it, multi-line JSON included", async () => {
  const f = setup();
  f.put("records/acme.md", '---\nname: Acme\nmedia: [\n  {\n    "file": "site/images/old.png",\n    "kind": "work",\n    "alt": "Old",\n    "url": "https://acme.example/"\n  }\n]\nkeywords: [fast]\n---\n\nThe body stays.\n');
  await f.run("images.mjs", ["next", "acme"]);
  const store = JSON.parse(readFileSync(join(f.dir, "raw/acme/images.json"), "utf8")).pictures;
  f.put("answers.json", store.filter((p) => !p.skip).map((p) => ({ file: p.file, what: `Picture ${p.file}`, kind: "work", own: true })));
  await f.run("images.mjs", ["save", "acme", "--file", join(f.dir, "answers.json")]);
  assert.equal((await f.run("images.mjs", ["apply", "acme"])).status, 0);
  const check = await f.run("check-record.mjs", ["acme"]);
  assert.equal(check.status, 0, check.stderr);
  assert.match(readFileSync(join(f.dir, "records/acme.md"), "utf8"), /The body stays/);
});

test("Google photos are a fallback: only after its own are described, only when too few, each once, with a credit", async (t) => {
  const f = setup();
  const png = readFileSync(join(f.dir, "raw/acme/site/images/job.png"));
  let calls = 0;
  const server = createServer((_req, res) => { calls++; res.writeHead(200, { "Content-Type": "image/png" }).end(png); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  f.put("raw/acme/places/x.json", { photos: [{ name: "places/x/photos/a", googleMapsUri: "https://maps.google.com/p", authorAttributions: [{ displayName: "Ann" }] }] });
  const env = { GOOGLE_PLACES_API_URL: `http://127.0.0.1:${server.address().port}`, GOOGLE_PLACES_API_KEY: "k" };
  const early = await f.run("images.mjs", ["google", "acme"], env);
  assert.equal(early.status, 1);
  assert.match(early.stderr, /describe its own site's pictures first/);
  assert.equal(calls, 0);

  await f.run("images.mjs", ["next", "acme"]);
  const describe = async (own) => {
    const store = JSON.parse(readFileSync(join(f.dir, "raw/acme/images.json"), "utf8")).pictures;
    f.put("answers.json", store.filter((p) => !p.skip).map((p) => ({ file: p.file, what: `Picture ${p.file}`, kind: "work", own })));
    await f.run("images.mjs", ["save", "acme", "--file", join(f.dir, "answers.json")]);
  };
  await describe(false);
  const one = await f.run("images.mjs", ["google", "acme"], env);
  assert.equal(one.status, 0, one.stderr);
  assert.match(one.stdout, /1 photos fetched/);
  await f.run("images.mjs", ["google", "acme"], env);
  assert.equal(calls, 1, "never paid for twice");
  assert.equal(Object.values(JSON.parse(readFileSync(join(f.dir, "raw/acme/places/photos/credits.json"), "utf8")))[0].credit, "Ann");
});

test("a company with enough of its own pictures fetches nothing from Google", async (t) => {
  const f = setup();
  let calls = 0;
  const server = createServer((_req, res) => { calls++; res.writeHead(500).end(); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  f.put("raw/acme/places/x.json", { photos: [{ name: "places/x/photos/a" }] });
  for (const seed of [11, 13, 17, 19, 23, 29]) execFileSync("python3", ["-c", DRAW, join(f.dir, `raw/acme/site/images/extra-${seed}.png`), "800", "600", String(seed)]);
  await f.run("images.mjs", ["next", "acme"]);
  const store = JSON.parse(readFileSync(join(f.dir, "raw/acme/images.json"), "utf8")).pictures;
  f.put("answers.json", store.filter((p) => !p.skip).map((p) => ({ file: p.file, what: `Picture ${p.file}`, kind: "work", own: true })));
  await f.run("images.mjs", ["save", "acme", "--file", join(f.dir, "answers.json")]);
  const r = await f.run("images.mjs", ["google", "acme"], { GOOGLE_PLACES_API_URL: `http://127.0.0.1:${server.address().port}`, GOOGLE_PLACES_API_KEY: "k" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(calls, 0);
  assert.match(r.stdout, /nothing was fetched/);
});

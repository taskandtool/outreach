#!/usr/bin/env node
// A company's pictures: each looked at once by the AI and described, so everything after works
// from the saved words. Code hashes them, drops near-copies, draws small sheets and picks.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { flag, has, done, fail, machineEnv, misused, noMore, parseArgs, usage } from "../src/data/cli.mjs";
import { at, connections, here, readCompanies, readJson, writeAtomic, writeJson } from "./lib.mjs";

const HELP = `usage: node scripts/images.mjs <command> <company> [options]

  next <company> [--count 9]
      Finds any new pictures, then draws the next ones nobody has described on a small numbered
      sheet. Prints the sheet's path and each number's file. Prints "all described" when done.
  save <company> --file answers.json
      Saves what you saw: a list of { "n": 1, "what": "...", "kind": "...", "own": true }, or
      "file" in place of "n". kind is team, work, before_after, premises, logo, stock, graphic
      or other. own is true only for this company's real people, vans, premises and jobs.
  list <company> [--json]
      Every picture and what it shows, with no need to open one.
  apply <company>
      Writes the record's media from the descriptions: its own pictures, the people first, 12 at most.
  google <company>
      A fallback, once its own site's pictures are described: when it has fewer than 6 real ones, fetches
      up to 10 photos from its saved Google listing, once each, with who uploaded each. Then run next.
  hide <company> <file> [--show]
      Takes a picture down for good, or brings it back. Then run apply.

A picture is described once, keyed by its hash, in raw/<company>/images.json, so a re-crawl
never pays to look again. Tiny pictures, vector art and near-copies are dropped by code first.
Exit 0 done, 1 failed, 2 misused.`;

const KINDS = ["team", "work", "before_after", "premises", "logo", "stock", "graphic", "other"];
const SHOWN = ["team", "work", "before_after", "premises", "other"];
const MIN_SIDE = 200;
/** Bits of 64 two pictures may differ by and still be one picture. */
const SAME_LOOK = 6;
const MOST = 12;
/** A company with this many real pictures of its own has no need of Google's. */
const ENOUGH = 6;

const a = parseArgs(process.argv.slice(2), { bare: ["json", "show"] });
const [cmd, slug, ...rest] = a._;
usage(a, cmd, ["next", "save", "list", "apply", "hide", "google"], HELP, "images", { next: ["count"], save: ["file"], list: ["json"], apply: [], hide: ["show"], google: [] });
if (!slug) misused(`images ${cmd}: name a company`, `node scripts/images.mjs ${cmd} <company>`);
noMore(rest, cmd === "hide" ? 1 : 0, `images ${cmd}`);

const STORE = at("raw", slug, "images.json");
/** Where a company's pictures are: what the crawl saved, its own Facebook and Instagram photos, and any Google photos fetched with `google`. */
const FOLDERS = ["site/images", "facebook/images", "instagram/images", "places/photos"];
const pathOf = (p) => join(at("raw", slug), p.dir ?? "site/images", p.file);
const row = readCompanies().find((r) => r.slug === slug);
if (!row) fail(`images: no company ${slug}`, "node scripts/pipeline.mjs status");

const load = () => readJson(STORE, { pictures: [] });
const save = (s) => writeJson(STORE, s);

const bits = (x, y) => {
  let v = BigInt(`0x${x}`) ^ BigInt(`0x${y}`);
  let n = 0;
  for (; v; v &= v - 1n) n++;
  return n;
};

/** Adds what the crawl has that the store doesn't. What is already described stays described. */
function refresh() {
  const store = load();
  const pages = new Map((readJson(at("raw", slug, "site", "_index", "media.json"), []) ?? []).filter((m) => m.file).map((m) => [m.file, m.pages?.[0]]));
  const credits = readJson(at("raw", slug, "places", "photos", "credits.json"), {});
  // A social photo's page is the profile it came from.
  const profiles = Object.fromEntries(readJson(at("raw", slug, "matches.json"), []).map((m) => [m.network, m.url]));
  const bySha = new Map(store.pictures.map((p) => [p.sha, p]));
  for (const dir of FOLDERS) {
    const folder = at("raw", slug, dir);
    if (!existsSync(folder)) continue;
    const r = spawnSync("python3", [here("image_look.py"), "scan", folder], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) fail(`images: ${(r.stderr || "could not read the pictures").trim().split("\n")[0]}`, "python3 -m pip install pillow");
    for (const line of r.stdout.trim().split("\n").filter(Boolean)) {
      const f = JSON.parse(line);
      const had = bySha.get(f.sha);
      if (had) Object.assign(had, { file: f.file, dir }, credits[f.file] ?? {});
      else store.pictures.push({ ...f, dir, page: dir === "site/images" ? (typeof pages.get(f.file) === "string" ? pages.get(f.file) : null) : profiles[dir.split("/")[0]] ?? null, what: null, kind: null, own: null, ...(credits[f.file] ?? {}) });
    }
  }
  // Largest first, so of near-copies the sharpest is the one that stays.
  const seen = [];
  for (const p of [...store.pictures].sort((x, y) => y.width * y.height - x.width * x.height)) {
    const tiny = Math.min(p.width, p.height) < MIN_SIDE;
    const twin = !tiny && seen.find((s) => bits(s.look, p.look) <= SAME_LOOK);
    p.skip = tiny ? "tiny" : twin ? `same as ${twin.file}` : null;
    if (!p.skip) seen.push(p);
  }
  save(store);
  return store;
}

const waiting = (s) => s.pictures.filter((p) => !p.skip && !p.what);

if (cmd === "next") {
  const count = Number(flag(a, "count") ?? 9);
  if (!(count >= 1 && count <= 24)) misused("images next: --count is 1 to 24", `node scripts/images.mjs next ${slug}`);
  const store = refresh();
  const left = waiting(store);
  if (!left.length) {
    done(`images next`, `${slug}: all described (${store.pictures.filter((p) => p.what).length} pictures, ${store.pictures.filter((p) => p.skip).length} dropped by code)`, { next: `node scripts/images.mjs apply ${slug}` });
  } else {
    const batch = left.slice(0, count);
    const sheet = at("raw", slug, "site", "_index", "to-describe.webp");
    const r = spawnSync("python3", [here("image_look.py"), "sheet", sheet, ...batch.map(pathOf)], { encoding: "utf8" });
    if (r.status !== 0) fail(`images next: ${(r.stderr || "could not draw the sheet").trim().split("\n")[0]}`, "python3 -m pip install pillow");
    writeJson(at("raw", slug, "site", "_index", "to-describe.json"), batch.map((p) => p.file));
    console.log(`images next: ${batch.length} of ${left.length} left to describe, on ${sheet}`);
    batch.forEach((p, i) => console.log(`  ${i + 1}: ${p.file}`));
    console.log(`\nNext: look at the sheet, then node scripts/images.mjs save ${slug} --file <answers.json>`);
  }
}

if (cmd === "save") {
  const file = flag(a, "file");
  if (!file) misused("images save: --file <answers.json>", `node scripts/images.mjs save ${slug} --file answers.json`);
  if (!existsSync(file)) fail(`images save: no file ${file}`, `node scripts/images.mjs save ${slug} --file answers.json`);
  let answers;
  try {
    answers = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    fail(`images save: ${file} is not JSON: ${e.message}`, 'a list of { "n": 1, "what": "...", "kind": "work", "own": true }');
  }
  if (!Array.isArray(answers)) fail(`images save: ${file} holds no list`, 'a list of { "n": 1, "what": "...", "kind": "work", "own": true }');
  const store = load();
  const numbered = readJson(at("raw", slug, "site", "_index", "to-describe.json"), []);
  let saved = 0;
  for (const x of answers) {
    const name = x.file ?? numbered[Number(x.n) - 1];
    const p = store.pictures.find((y) => y.file === name);
    if (!p) fail(`images save: no picture for ${JSON.stringify(x.file ?? x.n)}`, `node scripts/images.mjs next ${slug}, for the sheet's numbers`);
    if (!x.what || !KINDS.includes(x.kind) || typeof x.own !== "boolean") fail(`images save: ${name} needs what, a kind (${KINDS.join(", ")}) and own, true or false`, "fix that entry; nothing was saved");
    Object.assign(p, { what: String(x.what).replace(/[<>]/g, "").trim().slice(0, 200), kind: x.kind, own: x.own });
    saved++;
  }
  save(store);
  done("images save", `${saved} described, ${waiting(store).length} to go`, { next: waiting(store).length ? `node scripts/images.mjs next ${slug}` : `node scripts/images.mjs apply ${slug}` });
}

if (cmd === "list") {
  const store = load();
  if (has(a, "json")) console.log(JSON.stringify(store.pictures));
  else {
    console.log(`images list: ${slug}: ${store.pictures.filter((p) => p.what).length} described`);
    for (const p of store.pictures.filter((x) => x.what)) console.log(`  ${p.own ? "own  " : "     "}${p.kind.padEnd(13)}${p.file}: ${p.what}`);
  }
}

if (cmd === "google") {
  const dir = at("raw", slug, "places");
  const listing = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith(".json") && !f.endsWith(".summary.json")) : null;
  if (!listing) fail(`images google: ${slug} has no saved Google listing`, `node scripts/companies.mjs gather --company ${slug} --confirm`);
  const store = refresh();
  if (waiting(store).filter((p) => (p.dir ?? "site/images") === "site/images").length) fail(`images google: describe its own site's pictures first`, `node scripts/images.mjs next ${slug}`);
  const own = store.pictures.filter((p) => p.own && SHOWN.includes(p.kind) && !p.skip && !p.hidden && (p.dir ?? "site/images") === "site/images").length;
  if (own >= ENOUGH) {
    done("images google", `${slug} has ${own} real pictures of its own, so nothing was fetched`, { next: `node scripts/images.mjs apply ${slug}` });
    process.exit(0);
  }
  const photos = (readJson(join(dir, listing))?.photos ?? []).slice(0, 10);
  const env = machineEnv();
  const held = connections()["google-places"];
  const base = process.env.GOOGLE_PLACES_API_URL ?? (held ? `${String(env.PHOENIX_URL ?? "").replace(/\/+$/, "")}/api/machine/gateway/${held}` : "https://places.googleapis.com");
  const key = held ? env.MACHINE_TOKEN : process.env.GOOGLE_PLACES_API_KEY;
  if (!key) fail("images google: no Google Places connection", "python3 ~/tools/taskandtool.py request-connection google-places");
  const out = join(dir, "photos");
  mkdirSync(out, { recursive: true });
  const credits = readJson(join(out, "credits.json"), {});
  let got = 0;
  for (const p of photos) {
    const name = `${createHash("sha256").update(p.name).digest("hex").slice(0, 12)}.jpg`;
    const author = p.authorAttributions?.[0];
    credits[name] = { credit: author?.displayName ?? "Google", credit_url: p.googleMapsUri ?? author?.uri ?? null };
    if (existsSync(join(out, name))) continue;
    const r = await fetch(`${base}/v1/${p.name}/media?maxWidthPx=1600&key=${encodeURIComponent(key)}`);
    if (!r.ok) fail(`images google: Google answered ${r.status} for a photo; ${got} were saved`, `node scripts/images.mjs google ${slug}, later`);
    writeFileSync(join(out, name), Buffer.from(await r.arrayBuffer()));
    got++;
  }
  writeJson(join(out, "credits.json"), credits);
  done("images google", `${slug}: ${got} photos fetched, ${photos.length - got} already saved`, { next: `node scripts/images.mjs next ${slug}` });
}

if (cmd === "hide") {
  const store = load();
  const p = store.pictures.find((x) => x.file === rest[0]);
  if (!p) fail(`images hide: no picture ${rest[0]}`, `node scripts/images.mjs list ${slug}`);
  p.hidden = !has(a, "show");
  save(store);
  done("images hide", `${rest[0]} ${p.hidden ? "is taken down" : "is back"}`, { next: `node scripts/images.mjs apply ${slug}` });
}

if (cmd === "apply") {
  const file = at("records", `${slug}.md`);
  if (!existsSync(file)) fail(`images apply: no record for ${slug}`, `node scripts/pipeline.mjs status`);
  const store = load();
  if (waiting(store).length) fail(`images apply: ${waiting(store).length} pictures not described yet`, `node scripts/images.mjs next ${slug}`);
  const home = row.website || "";
  // Two pictures described alike are one picture to a reader: the largest stays.
  const said = new Set();
  const media = store.pictures
    .filter((p) => p.own && SHOWN.includes(p.kind) && !p.skip && !p.hidden)
    .sort((x, y) => SHOWN.indexOf(x.kind) - SHOWN.indexOf(y.kind) || y.width * y.height - x.width * x.height)
    .filter((p) => {
      const key = p.what.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return !said.has(key) && said.add(key);
    })
    .slice(0, MOST)
    .map((p) => ({ file: `${p.dir ?? "site/images"}/${p.file}`, kind: p.kind, alt: p.what, url: p.page || home, ...(p.credit ? { credit: p.credit, credit_url: p.credit_url ?? null } : {}) }));
  const text = readFileSync(file, "utf8");
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) fail(`images apply: records/${slug}.md has no front matter`, `node scripts/check-record.mjs ${slug}`);
  // Only media changes: a real YAML edit, whichever way the record wrote it.
  const doc = parseDocument(m[1]);
  if (doc.errors.length) fail(`images apply: records/${slug}.md does not parse: ${doc.errors[0].message.split("\n")[0]}`, `node scripts/check-record.mjs ${slug}`);
  if (media.length) doc.set("media", doc.createNode(media));
  else doc.delete("media");
  writeAtomic(file, `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false }).trimEnd()}\n---${text.slice(m[0].length)}`);
  done("images apply", `${slug}: ${media.length} pictures in its record`, { next: media.length < ENOUGH && !store.pictures.some((p) => p.dir === "places/photos") ? `node scripts/images.mjs google ${slug}, if it has a Google listing, then node scripts/check-record.mjs ${slug}` : `node scripts/check-record.mjs ${slug}` });
}

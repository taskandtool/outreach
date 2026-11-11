// Every script keeps the contract before it touches anything: --help and -h print
// the usage and exit 0; an unknown flag or command exits 2 with nothing on stdout
// and a Try line on stderr.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const empty = mkdtempSync(join(tmpdir(), "outreach-"));
const SCRIPTS = ["images.mjs", "companies.mjs", "pipeline.mjs", "contacts.mjs", "outreach.mjs", "check-record.mjs", "build-data.mjs", "check.mjs", "content.mjs", "dev.mjs", "test.mjs", "apply-design.mjs", "build.ts", "migrate.ts"];

const run = (script, args) =>
  new Promise((done) => {
    const argv = script.endsWith(".ts") ? ["--import", "tsx", `scripts/${script}`, ...args] : [`scripts/${script}`, ...args];
    execFile(process.execPath, argv, { cwd: root, encoding: "utf8", timeout: 60_000, env: { ...process.env, SITE_ROOT: empty } }, (err, stdout, stderr) =>
      done({ status: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr }),
    );
  });

for (const script of SCRIPTS) {
  test(`${script}: --help and -h print the usage and exit 0`, async () => {
    for (const h of ["--help", "-h"]) {
      const r = await run(script, [h]);
      assert.equal(r.status, 0, `${script} ${h}: ${r.stderr}`);
      assert.match(r.stdout, /\S/);
    }
  });
  test(`${script}: an unknown flag exits 2 with a Try line`, async () => {
    const first = ["companies.mjs", "pipeline.mjs"].includes(script) ? ["status"] : [];
    const r = await run(script, script === "companies.mjs" ? ["crawl", "--no-such-flag"] : [...first, "--no-such-flag"]);
    assert.equal(r.status, 2, `${script}: ${r.stderr}`);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Try: /);
  });
}

for (const [script, args] of [
  ["companies.mjs", ["nope"]],
  ["pipeline.mjs", ["nope"]],
  ["companies.mjs", ["find"]],
  ["pipeline.mjs", ["queue"]],
  ["pipeline.mjs", ["next"]],
  ["check-record.mjs", []],
]) {
  test(`${script} ${args.join(" ") || "(no arguments)"}: misuse exits 2 with a Try line`, async () => {
    const r = await run(script, args);
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Try: /);
  });
}

test("a missing company exits 1 with a Try line, nothing on stdout", async () => {
  for (const [script, args] of [["check-record.mjs", ["nobody"]], ["pipeline.mjs", ["status"]], ["build-data.mjs", []]]) {
    const r = await run(script, args);
    assert.equal(r.status, 1, `${script}: ${r.stderr}`);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /Try: /);
  }
});

test("sourceHash: a re-fetch of the same words is no change; different words are", async () => {
  const dir = mkdtempSync(join(tmpdir(), "outreach-"));
  const page = (fetched, body, rating = "4.9 from 60 reviews") => {
    mkdirSync(join(dir, "raw/a/site/pages"), { recursive: true });
    mkdirSync(join(dir, "raw/a/site/_index"), { recursive: true });
    writeFileSync(join(dir, "raw/a/site/pages/home.md"), `---\nurl: "https://a.test/"\nfetched: "${fetched}"\nfetcher: "chrome"\nhash: "${fetched}"\n---\n\n${body}\n\n- **Rating:** ${rating}\n`);
    writeFileSync(join(dir, "raw/a/site/_index/inventory.md"), fetched);
  };
  const hash = () =>
    new Promise((done, failed) =>
      execFile(process.execPath, ["--input-type=module", "-e", `import { sourceHash } from ${JSON.stringify(join(root, "scripts/lib.mjs"))}; console.log(sourceHash("a"))`], { cwd: root, encoding: "utf8", env: { ...process.env, SITE_ROOT: dir } }, (err, stdout) => (err ? failed(err) : done(stdout.trim()))),
    );
  page("2026-01-01T00:00:00Z", "10-year parts warranty");
  const first = await hash();
  page("2026-02-01T00:00:00Z", "10-year parts warranty", "4.8 from 61 reviews");
  assert.equal(await hash(), first);
  page("2026-02-01T00:00:00Z", "5-year parts warranty");
  assert.notEqual(await hash(), first);
});

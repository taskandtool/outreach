// Finding companies twice must never cost what the first pass learned.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { csv, folder } from "./fixture.mjs";

const rows = (f) => readFileSync(join(f.dir, "companies.csv"), "utf8");

test("a new company with another's name and its own site stays its own company", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "two-rivers", name: "Two Rivers", website: "https://a.example", domain: "a.example", phones: ["5125550100"], state: "found", source: "import" }));
  f.put("add.csv", "name,website,phone\nTwo Rivers,https://b.example,5125550199\n");
  const r = await f.run("companies.mjs", ["find", "--import", join(f.dir, "add.csv")]);
  assert.equal(r.status, 0, r.stderr);
  const text = rows(f);
  assert.match(text, /two-rivers-2/);
  assert.match(text.split("\n").find((l) => l.startsWith("two-rivers,")), /5125550100/);
});

test("importing names and sites wipes nothing, and leaving one out of a later file flags nothing", async () => {
  const f = folder();
  f.put("companies.csv", csv({ slug: "acme", name: "Acme", website: "https://acme.example", domain: "acme.example", phones: ["5125550100"], locations: [{ city: "Round Rock" }], state: "found", source: "import" }, { slug: "best", name: "Best", website: "https://best.example", domain: "best.example", state: "found", source: "import" }));
  f.put("add.csv", "name,website\nAcme,https://acme.example\n");
  assert.equal((await f.run("companies.mjs", ["find", "--import", join(f.dir, "add.csv")])).status, 0);
  const text = rows(f);
  assert.match(text, /5125550100/);
  assert.match(text, /Round Rock/);
  assert.doesNotMatch(text.split("\n").find((l) => l.startsWith("best,")), /\d{4}-\d{2}-\d{2}/);
});

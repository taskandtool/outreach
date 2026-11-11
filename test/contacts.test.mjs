// Finding who to email, against a fake gateway answering as Hunter and MillionVerifier document:
// the owner by name first, a webmail address checked twice, a 451 never stored, nothing spent
// without --confirm, and nothing looked up twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { folder } from "./fixture.mjs";

function gateway(answer) {
  const calls = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    const [, slug, path] = u.pathname.match(/^\/api\/machine\/gateway\/([^/]+)(\/.*)$/) ?? [];
    calls.push(`${slug}${path}${u.search}`);
    const [status, body] = answer(slug, path, u.searchParams);
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ calls, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

function bridge(f, providers) {
  const file = join(f.dir, "bridge.py");
  writeFileSync(file, `import json,sys\nif sys.argv[1]=="list-connections": print(json.dumps({"ok":True,"connections":[${providers.map((p) => `{"provider":"${p}","slug":"${p}","gateway_url":"x","status":"active"}`).join(",")}]}))\nelse: print(json.dumps({"ok":True}))\n`);
  return file;
}

/** Three built companies, each with a page worth sending. */
function built() {
  const f = folder();
  const co = (slug, name, extra = {}) => ({ slug, name, path: `/${slug}`, domain: `${slug}.example`, emails: [], background: null, ...extra });
  f.put("data/companies.json", [
    co("larkspur-heating", "Larkspur Heating", { background: { people: [{ name: "Dana Reyes", role: "Owner" }] } }),
    co("fernway-air", "Fernway Air", { emails: [{ value: "office@fernway-mail.example" }] }),
    co("two-rivers", "Two Rivers Cooling"),
  ]);
  f.put("data/pages.json", ["larkspur-heating", "fernway-air", "two-rivers"].map((s) => ({ path: `/${s}`, kind: "company", index: false, ready: true })));
  return f;
}

const HUNTER = (slug, path, q) => {
  if (slug === "millionverifier") return [200, { result: "ok" }];
  if (path === "/v2/email-finder") return [200, { data: { email: "dana@larkspur-heating.example", score: 94 } }];
  if (path === "/v2/domain-search") {
    if (q.get("domain") === "two-rivers.example") return [451, { errors: [{ details: "This person asked not to be processed" }] }];
    return [200, { data: { emails: [] } }];
  }
  if (path === "/v2/email-verifier") return [200, { data: { status: q.get("email").startsWith("office@fernway") ? "webmail" : "valid" } }];
  return [404, {}];
};

const contact = (f, slug) => JSON.parse(readFileSync(join(f.dir, "raw", slug, "contact", "contact.json"), "utf8"));

test("find previews and spends nothing without --confirm", async (t) => {
  const f = built();
  const g = await gateway(HUNTER);
  t.after(g.close);
  const r = await f.run("contacts.mjs", ["find"], { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f, ["hunter", "millionverifier"]) });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /3 companies, at most 9 Hunter calls/);
  assert.match(r.stdout, /Nothing was spent/);
  assert.equal(g.calls.length, 0);
});

test("the owner by name, webmail checked twice, a 451 never stored, and nothing looked up twice", async (t) => {
  const f = built();
  const g = await gateway(HUNTER);
  t.after(g.close);
  const env = { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f, ["hunter", "millionverifier"]) };
  const r = await f.run("contacts.mjs", ["find", "--confirm"], env);
  assert.equal(r.status, 0, r.stderr);

  const dana = contact(f, "larkspur-heating");
  assert.equal(dana.email, "dana@larkspur-heating.example");
  assert.equal(dana.source, "Hunter email-finder", "the owner's name from the site goes to the finder first");
  assert.equal(dana.verdict, "valid");

  const fern = contact(f, "fernway-air");
  assert.equal(fern.email, "office@fernway-mail.example", "the site's own address when Hunter knows no one");
  assert.equal(fern.verdict, "valid");
  assert.equal(fern.checkedBy, "MillionVerifier", "Hunter can't confirm webmail, so MillionVerifier does");

  const blocked = contact(f, "two-rivers");
  assert.equal(blocked.verdict, "blocked");
  assert.equal(blocked.email, null, "a 451 keeps no address");
  assert.match(r.stdout, /Two Rivers Cooling: blocked; never contact/);

  const before = g.calls.length;
  const again = await f.run("contacts.mjs", ["find", "--confirm"], env);
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already, left alone/);
  assert.equal(g.calls.length, before, "a second run calls no one");

  const list = await f.run("contacts.mjs", ["list"]);
  assert.match(list.stdout, /2 sendable contacts/);
  assert.doesNotMatch(list.stdout, /Two Rivers/);
});

test("a 451 from the verifier leaves no address in any saved file", async (t) => {
  const f = built();
  f.put("data/companies.json", [{ slug: "larkspur-heating", name: "Larkspur Heating", path: "/larkspur-heating", domain: "larkspur-heating.example", emails: [], background: { people: [{ name: "Dana Reyes", role: "Owner" }] } }]);
  const g = await gateway((slug, path) => (path === "/v2/email-finder" ? [200, { data: { email: "dana@larkspur-heating.example" } }] : [451, {}]));
  t.after(g.close);
  const r = await f.run("contacts.mjs", ["find", "--confirm"], { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f, ["hunter"]) });
  assert.equal(r.status, 0, r.stderr);
  for (const file of ["contact.json", "hunter.json", "site.json"]) {
    assert.doesNotMatch(readFileSync(join(f.dir, "raw/larkspur-heating/contact", file), "utf8"), /dana@/, file);
  }
});

test("every lookup failing is a failure, not a quiet success", async (t) => {
  const f = built();
  const g = await gateway(() => [500, {}]);
  t.after(g.close);
  const r = await f.run("contacts.mjs", ["find", "--confirm"], { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f, ["hunter"]) });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /every lookup failed/);
});

test("a 429 stops the run, keeps what it found, and says to come back", async (t) => {
  const f = built();
  const g = await gateway((slug, path) => (path === "/v2/email-finder" ? [200, { data: { email: "dana@larkspur-heating.example" } }] : path === "/v2/email-verifier" ? [200, { data: { status: "valid" } }] : [429, { errors: [] }]));
  t.after(g.close);
  const r = await f.run("contacts.mjs", ["find", "--confirm"], { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f, ["hunter"]) });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /stopped, Hunter's limit for now \(429\); progress is kept/);
  assert.match(r.stderr, /Try: node scripts\/contacts.mjs find --confirm/);
  assert.equal(contact(f, "larkspur-heating").verdict, "valid");
});

test("without Hunter and with no address of their own, it asks for the connection", async () => {
  const f = built();
  f.put("data/companies.json", [{ slug: "two-rivers", name: "Two Rivers Cooling", path: "/two-rivers", domain: "two-rivers.example", emails: [] }]);
  const r = await f.run("contacts.mjs", ["find"]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /request-connection hunter/);
});

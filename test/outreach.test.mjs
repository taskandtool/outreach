// The emails from draft to the campaign, against a fake gateway answering as Instantly does:
// a draft only for a sendable contact, approval only past the check, an opt-out kept forever,
// and leads added (never the campaign started) only with --confirm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { folder } from "./fixture.mjs";

function gateway() {
  const calls = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push({ path: new URL(req.url, "http://x").pathname, body: body ? JSON.parse(body) : null });
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "success", leads_uploaded: 1 }));
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ calls, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

function bridge(f) {
  const file = join(f.dir, "bridge.py");
  writeFileSync(file, 'import json,sys\nif sys.argv[1]=="list-connections": print(json.dumps({"ok":True,"connections":[{"provider":"instantly","slug":"instantly","gateway_url":"x","status":"active"}]}))\nelse: print(json.dumps({"ok":True}))\n');
  return file;
}

const SITE = '---\nagency_name: Quillmark Studio\ndomain: sites.example\nsender:\n  name: Sam Rivera\n  postal_address: "1 Main St, Round Rock, TX 78664"\ninstantly_campaign: camp-1\n---\n';

function built() {
  const f = folder();
  f.put("SITE.md", SITE);
  f.put("data/companies.json", [
    { slug: "larkspur-heating", name: "Larkspur Heating", path: "/larkspur-heating" },
    { slug: "fernway-air", name: "Fernway Air", path: "/fernway-air" },
  ]);
  f.put("data/pages.json", [{ path: "/larkspur-heating", ready: true }, { path: "/fernway-air", ready: true }]);
  f.put("raw/larkspur-heating/contact/contact.json", { email: "dana@larkspur-heating.example", name: "Dana Reyes", role: "Owner", source: "Hunter email-finder", verdict: "valid" });
  f.put("raw/fernway-air/contact/contact.json", { email: null, verdict: "blocked" });
  return f;
}

const draft = (f, slug) => {
  const text = readFileSync(join(f.dir, "outreach", `${slug}.md`), "utf8");
  return parse(text.match(/^---\n([\s\S]*?)\n---/)[1]);
};
const fill = (f, slug, subject, opener) => {
  const file = join(f.dir, "outreach", `${slug}.md`);
  const text = readFileSync(file, "utf8").replace('subject: ""', `subject: ${JSON.stringify(subject)}`).replace('opener: ""', `opener: ${JSON.stringify(opener)}`);
  writeFileSync(file, text);
};

test("a draft only for a sendable contact, with its own page link", async () => {
  const f = built();
  const empty = await f.run("outreach.mjs", ["list"]);
  assert.match(empty.stdout, /Next: node scripts\/outreach.mjs draft$/m, "with nothing drafted, the next step is drafting");
  const r = await f.run("outreach.mjs", ["draft"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 drafts made/);
  const d = draft(f, "larkspur-heating");
  assert.equal(d.to, "dana@larkspur-heating.example");
  assert.equal(d.status, "draft");
  assert.match(d.page, /^https:\/\/larkspur-heating\.sites\.example\/\?r=[A-Za-z0-9_-]{12}$/);
  assert.equal(d.page.endsWith(d.ref), true, "the link names the lead, so a visit can");
  const again = await f.run("outreach.mjs", ["draft"]);
  assert.match(again.stdout, /0 drafts made/, "a draft is made once");
});

test("approval waits for the check, and an opt-out is never sent", async () => {
  const f = built();
  await f.run("outreach.mjs", ["draft"]);
  const early = await f.run("outreach.mjs", ["approve", "larkspur-heating"]);
  assert.match(early.stdout, /left as a draft, it has no subject/);
  assert.equal(draft(f, "larkspur-heating").status, "draft");
  const check = await f.run("outreach.mjs", ["check"]);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /outreach\/larkspur-heating.md: has no subject/);

  fill(f, "larkspur-heating", "Larkspur's labor guarantee, on one page", "Your 10-year labor guarantee leads the page we built from your website.");
  assert.equal((await f.run("outreach.mjs", ["check"])).status, 0);
  const ok = await f.run("outreach.mjs", ["approve", "larkspur-heating"]);
  assert.match(ok.stdout, /1 of 1 approved/);
  for (const out of [ok.stdout, (await f.run("outreach.mjs", ["list"])).stdout]) {
    assert.match(out, /Nothing was sent. If the owner asked for it: node scripts\/outreach.mjs send --confirm/);
    assert.doesNotMatch(out, /^Next: .*send/m, "Next: never names a send");
  }

  const out = await f.run("outreach.mjs", ["optout", "Dana@Larkspur-Heating.example"]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(draft(f, "larkspur-heating").status, "opted-out");
  assert.match(readFileSync(join(f.dir, "outreach", "optouts.csv"), "utf8"), /dana@larkspur-heating\.example,/);
  const twice = await f.run("outreach.mjs", ["optout", "dana@larkspur-heating.example"]);
  assert.match(twice.stdout, /opted out already, left alone/);
  const send = await f.run("outreach.mjs", ["send"]);
  assert.match(send.stdout, /nothing approved to add/);
});

test("send adds approved leads to the campaign only with --confirm, and never starts it", async (t) => {
  const f = built();
  await f.run("outreach.mjs", ["draft"]);
  fill(f, "larkspur-heating", "Larkspur's labor guarantee, on one page", "Your 10-year labor guarantee leads the page we built from your website.");
  await f.run("outreach.mjs", ["approve", "--all"]);
  const g = await gateway();
  t.after(g.close);
  const env = { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f) };

  const preview = await f.run("outreach.mjs", ["send"], env);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /1 approved leads would be added to Instantly campaign camp-1/);
  assert.match(preview.stdout, /Nothing was sent. If the owner asked for it: node scripts\/outreach.mjs send --confirm/);
  assert.equal(g.calls.length, 0);

  const r = await f.run("outreach.mjs", ["send", "--confirm"], env);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(g.calls.map((c) => c.path), ["/api/machine/gateway/instantly/api/v2/leads/add"], "leads added; nothing activates the campaign");
  const lead = g.calls[0].body.leads[0];
  assert.equal(g.calls[0].body.campaign_id, "camp-1");
  assert.equal(lead.email, "dana@larkspur-heating.example");
  assert.equal(lead.first_name, "Dana");
  assert.match(lead.custom_variables.page_url, /larkspur-heating\.sites\.example/);
  assert.equal(draft(f, "larkspur-heating").status, "queued");
  const again = await f.run("outreach.mjs", ["send", "--confirm"], env);
  assert.match(again.stdout, /nothing approved to add/, "queued once");
  assert.equal(g.calls.length, 1);
});

test("send checks again: an address opted out after approval, or a draft emptied after it, is not added", async (t) => {
  const f = built();
  await f.run("outreach.mjs", ["draft"]);
  fill(f, "larkspur-heating", "Larkspur's labor guarantee, on one page", "Your 10-year labor guarantee leads the page we built from your website.");
  await f.run("outreach.mjs", ["approve", "--all"]);
  const g = await gateway();
  t.after(g.close);
  const env = { PHOENIX_URL: g.url, MACHINE_TOKEN: "t", TT_BRIDGE: bridge(f) };

  const file = join(f.dir, "outreach", "larkspur-heating.md");
  writeFileSync(file, readFileSync(file, "utf8").replace(/subject: .*/, 'subject: ""'));
  const edited = await f.run("outreach.mjs", ["send", "--confirm"], env);
  assert.match(edited.stdout, /went back to draft/);
  assert.equal(draft(f, "larkspur-heating").status, "draft");

  fill(f, "larkspur-heating", "Larkspur's labor guarantee, on one page", "");
  await f.run("outreach.mjs", ["approve", "--all"]);
  f.put("outreach/optouts.csv", "email,on\ndana@larkspur-heating.example,2026-06-01\n");
  const out = await f.run("outreach.mjs", ["send", "--confirm"], env);
  assert.match(out.stdout, /nothing approved to add/);
  assert.equal(g.calls.length, 0, "no lead reaches the campaign");
});

test("send refuses without the sender's postal address, which every email carries", async () => {
  const f = built();
  f.put("SITE.md", SITE.replace('  postal_address: "1 Main St, Round Rock, TX 78664"\n', ""));
  await f.run("outreach.mjs", ["draft"]);
  fill(f, "larkspur-heating", "Larkspur's labor guarantee, on one page", "Your 10-year labor guarantee leads the page we built from your website.");
  await f.run("outreach.mjs", ["approve", "--all"]);
  const r = await f.run("outreach.mjs", ["send"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /postal_address/);
});

test("visits without a database say so, with the command that fixes it", async () => {
  const r = await built().run("outreach.mjs", ["visits"], { DATABASE_URL: "" });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /Try: python3 ~\/tools\/taskandtool.py request-database/);
});

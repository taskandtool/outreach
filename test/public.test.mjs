// The Worker's own routes: which company a host names, what "/" answers, and visits.
import { test } from "node:test";
import assert from "node:assert/strict";
import app, { companyOfHost } from "../src/public.tsx";
import { site } from "../src/shell.tsx";

test("a company's subdomain names it; the bare domain, www and anything deeper name none", () => {
  assert.equal(companyOfHost("larkspur-heating.sites.example", "sites.example"), "larkspur-heating");
  assert.equal(companyOfHost("Larkspur-Heating.Sites.Example:443", "sites.example"), "larkspur-heating");
  assert.equal(companyOfHost("sites.example", "sites.example"), null);
  assert.equal(companyOfHost("www.sites.example", "sites.example"), null);
  assert.equal(companyOfHost("a.b.sites.example", "sites.example"), null);
  assert.equal(companyOfHost("larkspur-heating.other.example", "sites.example"), null);
  assert.equal(companyOfHost("larkspur-heating.sites.example", ""), null, "no domain set, no subdomains");
});

test('"/" on a subdomain is that company\'s page; on the bare domain, the agency', async (t) => {
  const was = { ...site };
  t.after(() => Object.assign(site, was));
  Object.assign(site, { domain: "sites.example", url: "https://sites.example", agencyUrl: "https://agency.example" });
  const asked = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    asked.push(String(u));
    return String(u).endsWith("/larkspur-heating") ? new Response("<p>Larkspur's page</p>", { status: 200 }) : new Response("", { status: 404 });
  };
  t.after(() => (globalThis.fetch = realFetch));

  const page = await app.request("https://larkspur-heating.sites.example/");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Larkspur's page/);
  assert.deepEqual(asked, ["https://larkspur-heating.sites.example/larkspur-heating"], "from its own host, never the bare domain");

  assert.equal((await app.request("https://nobody.sites.example/")).status, 404, "a subdomain with no page is not found");

  const bare = await app.request("https://sites.example/");
  assert.equal(bare.status, 302);
  assert.equal(bare.headers.get("location"), "https://agency.example");
});

test("a visit without a database is quietly not counted", async () => {
  const r = await app.request("/visit/larkspur-heating", { method: "POST", body: new URLSearchParams({ r: "abcdefgh12" }) });
  assert.equal(r.status, 204);
});

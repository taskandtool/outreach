#!/usr/bin/env node
// Who to email at each company, cheapest first: what its own site and profiles show, then
// Hunter, then a verdict on the address. Each answer is saved under raw/<slug>/contact/, so
// nothing is looked up or paid for twice. No AI.
import { done, fail, flag, has, limitOf, noMore, parseArgs, usage } from "../src/data/cli.mjs";
import { at, connections, readJson, today, vendor, writeJson } from "./lib.mjs";

const HELP = `usage: node scripts/contacts.mjs <command> [options]

  find [--company <slug>] [--limit N] [--again] [--confirm]
      For each company with a page worth sending (data/pages.json ready) and no
      contact yet: the owner's name and any address its site and profiles show,
      then Hunter (an email-finder by the owner's name, else a domain search for
      decision makers), then Hunter's verifier on the address chosen, and
      MillionVerifier again for a webmail address (Gmail, Outlook). Only an
      address both call safe is sendable. Without --confirm it says how many
      Hunter calls it would make and spends nothing. --again looks again.
  list [--all]
      Each company's contact: the address, whose it is, where it came from and
      the verdict. Sendable ones by default; --all for every one.

Prints what it did, by company, then Next:. Exit 0 done, 1 failed or a missing
connection, 2 misused.`;

const a = parseArgs(process.argv.slice(2), { bare: ["again", "confirm", "all"] });
const [cmd, ...rest] = a._;
usage(a, cmd, ["find", "list"], HELP, "contacts", { find: ["company", "limit", "again", "confirm"], list: ["all"] });
noMore(rest, 0, `contacts ${cmd}`);

const companies = readJson(at("data", "companies.json"));
if (!companies) fail(`contacts ${cmd}: data/ has not been built`, "node scripts/build-data.mjs");
const ready = new Set((readJson(at("data", "pages.json"), []) ?? []).filter((p) => p.ready).map((p) => p.path));
const contactFile = (slug) => at("raw", slug, "contact", "contact.json");

/** Mail a business owner reads themselves, which Hunter can't confirm, so a second verifier does. */
const WEBMAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|zoho)\./i;
const OWNERISH = /\b(owner|founder|co-founder|president|ceo|principal|proprietor|general manager)\b/i;

/** What the company's own site and profiles show: free, and first. */
function fromSite(c) {
  const owner = (c.background?.people ?? []).find((p) => OWNERISH.test(p.role ?? "")) ?? null;
  return { owner, emails: (c.emails ?? []).map((e) => e.value) };
}

/** A Hunter answer that means stop: 429 for today; 451 means this person asked never to be stored. */
class Stop extends Error {}

async function hunter(conn, path) {
  try {
    return await vendor(conn, path);
  } catch (e) {
    if (e.status === 451) return { blocked: true };
    if (e.status === 429 || e.refusal) throw new Stop(e.refusal ? `Task & Tool refused: ${e.refusal}` : "Hunter's limit for now (429)");
    throw e;
  }
}

/** The best address Hunter knows: the owner's by name, else the most confident decision maker. */
async function fromHunter(conn, c, owner) {
  if (!c.domain) return { none: "no website domain to search" };
  if (owner?.name && owner.name.trim().includes(" ")) {
    const r = await hunter(conn, `/v2/email-finder?domain=${encodeURIComponent(c.domain)}&full_name=${encodeURIComponent(owner.name)}`);
    if (r.blocked) return { blocked: true };
    if (r.data?.email) return { email: r.data.email, name: owner.name, role: owner.role ?? null, source: "Hunter email-finder", score: r.data.score ?? null };
  }
  const r = await hunter(conn, `/v2/domain-search?domain=${encodeURIComponent(c.domain)}&decision_maker=true&limit=10`);
  if (r.blocked) return { blocked: true };
  const best = (r.data?.emails ?? []).filter((e) => e.value).sort((x, y) => Number(OWNERISH.test(y.position ?? "")) - Number(OWNERISH.test(x.position ?? "")) || (y.confidence ?? 0) - (x.confidence ?? 0))[0];
  return best ? { email: best.value, name: [best.first_name, best.last_name].filter(Boolean).join(" ") || null, role: best.position ?? null, source: "Hunter domain search", score: best.confidence ?? null } : { none: "Hunter knows no one there" };
}

/** Hunter's verdict, and MillionVerifier's again for webmail. Only "valid" (and MillionVerifier's "ok") is sendable. */
async function verdictOf(conns, email) {
  if (!conns.hunter) return { verdict: "unchecked", why: "Hunter is not connected" };
  const r = await hunter(conns.hunter, `/v2/email-verifier?email=${encodeURIComponent(email)}`);
  if (r.blocked) return { blocked: true };
  const status = r.data?.status ?? null;
  if (!status) return { verdict: "waiting", why: "Hunter is still checking; run again later" };
  if (status === "valid") return { verdict: "valid" };
  if (status === "webmail" || (status === "accept_all" && WEBMAIL.test(email))) {
    if (!conns.millionverifier) return { verdict: "webmail", why: "a webmail address needs MillionVerifier, which is not connected" };
    const m = await vendor(conns.millionverifier, `/api/v3/?email=${encodeURIComponent(email)}&timeout=10`).catch((e) => {
      throw e.status === 429 || e.refusal ? new Stop(e.refusal ? `Task & Tool refused: ${e.refusal}` : "MillionVerifier's limit for now (429)") : e;
    });
    if (m.result === "error") return { verdict: "waiting", why: `MillionVerifier could not check it: ${m.error ?? "error"}` };
    return m.result === "ok" ? { verdict: "valid", checkedBy: "MillionVerifier" } : { verdict: m.result, why: `MillionVerifier says ${m.result}` };
  }
  return { verdict: status, why: `Hunter says ${status}` };
}

const sendable = (x) => x?.verdict === "valid";

if (cmd === "find") {
  const only = flag(a, "company");
  if (only && !companies.some((c) => c.slug === only)) fail(`contacts find: no company ${only}`, "node scripts/contacts.mjs list --all");
  const limit = limitOf(a, "contacts find", { fallback: 50 });
  const todo = companies
    .filter((c) => (only ? c.slug === only : ready.has(c.path)))
    .filter((c) => has(a, "again") || !readJson(contactFile(c.slug)) || readJson(contactFile(c.slug)).verdict === "waiting")
    .slice(0, limit);
  if (!todo.length) {
    done("contacts find", only ? `${only} already has a contact, left alone` : "every company with a page worth sending has a contact already, left alone", { next: "node scripts/contacts.mjs list" });
    process.exit(0);
  }
  const conns = connections();
  if (!conns.hunter && !todo.some((c) => fromSite(c).emails.length)) fail("contacts find: Hunter is not connected, and these companies show no address of their own", 'python3 ~/tools/taskandtool.py request-connection hunter --why "Find and verify the owner\'s email address at each company"');
  if (!has(a, "confirm")) {
    console.log(`contacts find: ${todo.length} companies, at most ${todo.length * 3} Hunter calls (a search, a finder and a verification each)${conns.millionverifier ? ", and a MillionVerifier check for each webmail address" : ""}`);
    console.log(`  ${todo.slice(0, 12).map((c) => c.name).join(", ")}${todo.length > 12 ? `, and ${todo.length - 12} more` : ""}`);
    if (!conns.hunter) console.log("  Hunter is not connected: only the addresses the companies show, unchecked");
    console.log(`  Nothing was spent. If the owner said yes: node scripts/contacts.mjs find${only ? ` --company ${only}` : ""}${has(a, "again") ? " --again" : ""} --confirm`);
    process.exit(0);
  }
  const lines = [];
  let stopped = null;
  let failed = 0;
  /** A Hunter 451: that person asked not to be stored or contacted, so no address is kept anywhere. */
  const block = (c) => {
    writeJson(at("raw", c.slug, "contact", "hunter.json"), { blocked: true, on: today() });
    writeJson(contactFile(c.slug), { email: null, verdict: "blocked", why: "Hunter says this person asked not to be stored or contacted", on: today() });
    lines.push(`${c.name}: blocked; never contact (Hunter 451)`);
  };
  for (const c of todo) {
    if (stopped) break;
    const site = fromSite(c);
    writeJson(at("raw", c.slug, "contact", "site.json"), { ...site, on: today() });
    let found = null;
    try {
      let pick = null;
      if (conns.hunter) {
        const h = await fromHunter(conns.hunter, c, site.owner);
        if (h.blocked) {
          block(c);
          continue;
        }
        if (h.email) pick = h;
        // Saved once the verifier has answered: a 451 there must leave no address here either.
        found = h;
      }
      // The company's own address, when Hunter has no one: small businesses often read it themselves.
      pick ??= site.emails[0] ? { email: site.emails[0], name: site.owner?.name ?? null, role: site.owner?.role ?? null, source: "their website" } : null;
      if (!pick) {
        writeJson(contactFile(c.slug), { email: null, verdict: "none", why: "no address found", on: today() });
        lines.push(`${c.name}: no address found`);
        continue;
      }
      const v = await verdictOf(conns, pick.email);
      if (v.blocked) {
        block(c);
        continue;
      }
      if (found) writeJson(at("raw", c.slug, "contact", "hunter.json"), { ...found, on: today() });
      writeJson(contactFile(c.slug), { ...pick, ...v, on: today() });
      lines.push(`${c.name}: ${pick.email}${pick.name ? ` (${pick.name}${pick.role ? `, ${pick.role}` : ""})` : ""} from ${pick.source}, ${sendable(v) ? "sendable" : `not sendable: ${v.why ?? v.verdict}`}`);
    } catch (e) {
      if (e instanceof Stop) stopped = e.message;
      else {
        failed++;
        lines.push(`${c.name}: stopped, ${e.message}`);
      }
    }
  }
  if (!stopped && failed && failed === todo.length) stopped = "every lookup failed";
  if (stopped) {
    console.error(`contacts find: stopped, ${stopped}; progress is kept\n${lines.map((l) => `  ${l}`).join("\n")}`);
    console.error("  Try: node scripts/contacts.mjs find --confirm, later");
    process.exit(1);
  }
  done("contacts find", `${lines.length} companies`, { lines, next: "node scripts/contacts.mjs list" });
}

if (cmd === "list") {
  const rows = companies.map((c) => ({ c, x: readJson(contactFile(c.slug)) })).filter(({ x }) => x && (has(a, "all") || sendable(x)));
  done("contacts list", `${rows.length} ${has(a, "all") ? "contacts" : "sendable contacts"}`, {
    lines: rows.slice(0, 40).map(({ c, x }) => `${c.name}: ${x.email ?? "none"}${x.name ? ` (${x.name})` : ""}${x.source ? `, from ${x.source}` : ""}, ${x.verdict}${x.why && !sendable(x) ? `: ${x.why}` : ""}`).concat(rows.length > 40 ? [`40 of ${rows.length}`] : []),
    next: rows.length ? "node scripts/outreach.mjs draft" : "node scripts/contacts.mjs find",
  });
}

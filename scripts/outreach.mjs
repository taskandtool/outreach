#!/usr/bin/env node
// The emails, from draft to the owner's campaign: one file each, outreach/<slug>.md, whose
// status moves draft → approved (the owner's yes) → queued (added to the Instantly campaign).
// The campaign's own sequence sends it and its follow-ups, from the owner's warmed mailboxes,
// once the owner starts it there. An opt-out is kept forever and checked before anything.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { stringify } from "yaml";
import { askForDatabase, done, fail, flag, has, limitOf, machineEnv, misused, noMore, parseArgs, usage } from "../src/data/cli.mjs";
import { at, connections, frontMatter, here, readJson, today, vendor, writeAtomic } from "./lib.mjs";

const HELP = `usage: node scripts/outreach.mjs <command> [options]

  draft [--company <slug>] [--limit N]
      A draft for each company with a page worth sending and a sendable contact
      (contacts.mjs) that has none yet and has not opted out: outreach/<slug>.md
      with the address, the person and the page's link, each link with its own
      ?r= so a visit names the lead. The cold-email skill writes its subject and
      opener. Spends nothing.
  check [<slug>]
      Every draft (or one) has its subject and opener, short enough, with no AI
      tell. Exit 1 lists what to fix.
  list [--status draft|approved|queued|opted-out]
      The approval list: each draft's company, address, subject and opener.
  approve <slug>... | --all
      Marks drafts approved: only when the owner has said yes to them. A draft
      that fails check is left alone.
  send [--confirm]
      The approved drafts, into the Instantly campaign SITE.md names
      (instantly_campaign), each with its page link and opener as the lead's
      variables. Never starts the campaign: the owner does that in Instantly.
      Without --confirm it lists who would be added and sends nothing.
  optout <email>
      Records an opt-out in outreach/optouts.csv, kept forever; a draft to that
      address is marked opted-out and never sent.
  visits [--days 30]
      Who opened their page, from the database: each company's visits, and a
      warm lead where a visit came from its email's link.

Prints what it did, by company, then Next:. Exit 0 done, 1 failed or refused, 2 misused.`;

const a = parseArgs(process.argv.slice(2), { bare: ["all", "confirm"] });
const [cmd, ...rest] = a._;
usage(a, cmd, ["draft", "check", "list", "approve", "send", "optout", "visits"], HELP, "outreach", {
  draft: ["company", "limit"],
  check: [],
  list: ["status"],
  approve: ["all"],
  send: ["confirm"],
  optout: [],
  visits: ["days"],
});

const STATUSES = ["draft", "approved", "queued", "opted-out"];
const owner = frontMatter(existsSync(at("SITE.md")) ? readFileSync(at("SITE.md"), "utf8") : "")?.data ?? {};
const draftFile = (slug) => at("outreach", `${slug}.md`);
const OPTOUTS = at("outreach", "optouts.csv");

/** Every address that opted out, lower-cased. */
const optedOut = () => new Set(existsSync(OPTOUTS) ? readFileSync(OPTOUTS, "utf8").split("\n").slice(1).map((l) => l.split(",")[0].trim().toLowerCase()).filter(Boolean) : []);

function readDraft(slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !existsSync(draftFile(slug))) return null;
  const fm = frontMatter(readFileSync(draftFile(slug), "utf8"));
  return fm && !fm.error ? { ...fm.data, body: fm.body ?? "" } : null;
}
const writeDraft = (slug, d) => {
  const { body = "", ...data } = d;
  writeAtomic(draftFile(slug), `---\n${stringify(data).trimEnd()}\n---\n${body}`);
};
const allDrafts = () => (existsSync(at("outreach")) ? readdirSync(at("outreach")).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).map((slug) => ({ slug, d: readDraft(slug) })).filter((x) => x.d) : []);

/** A company's page, as the email links it: its own subdomain, else its path on the site. */
function pageLink(slug, ref) {
  const domain = String(owner.domain ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const url = String(owner.url ?? "").replace(/\/+$/, "");
  // A DNS label holds 63 characters: a longer slug is linked by its path.
  if (domain && slug.length <= 63) return `https://${slug}.${domain}/?r=${ref}`;
  if (url) return `${url}/${slug}?r=${ref}`;
  return null;
}

/** What is wrong with a draft before it can be approved. */
function problems(slug, d) {
  const out = [];
  if (!d.to) out.push("has no address");
  if (!d.subject?.trim()) out.push("has no subject: the cold-email skill writes it");
  else if (d.subject.length > 60) out.push(`subject is ${d.subject.length} characters: keep it under 60`);
  if (!d.opener?.trim()) out.push("has no opener: the cold-email skill writes it");
  else if (d.opener.length > 300) out.push(`opener is ${d.opener.length} characters: one or two sentences, under 300`);
  if (d.subject?.trim() && d.opener?.trim()) {
    const r = spawnSync("node", [here("..", ".claude", "skills", "tropes", "tropes.mjs"), "--kind", "text", "-"], { encoding: "utf8", input: `${d.subject}\n${d.opener}\n` });
    if (r.status === 1) out.push(`reads as AI: ${`${r.stdout}${r.stderr}`.trim().split("\n").slice(0, 3).join("; ")}`);
  }
  if (optedOut().has(String(d.to ?? "").toLowerCase())) out.push("opted out: never send");
  return out;
}

if (cmd === "draft") {
  noMore(rest, 0, "outreach draft");
  const companies = readJson(at("data", "companies.json"));
  if (!companies) fail("outreach draft: data/ has not been built", "node scripts/build-data.mjs");
  const only = flag(a, "company");
  if (only && !companies.some((c) => c.slug === only)) fail(`outreach draft: no company ${only}`, "node scripts/contacts.mjs list --all");
  const ready = new Set((readJson(at("data", "pages.json"), []) ?? []).filter((p) => p.ready).map((p) => p.path));
  const out = optedOut();
  const limit = limitOf(a, "outreach draft", { fallback: 50 });
  const made = [];
  const skipped = [];
  for (const c of companies.filter((x) => (only ? x.slug === only : ready.has(x.path)))) {
    if (made.length >= limit) break;
    if (readDraft(c.slug)) continue;
    const contact = readJson(at("raw", c.slug, "contact", "contact.json"));
    if (contact?.verdict !== "valid") {
      if (only) skipped.push(`${c.name}: no sendable contact (${contact?.verdict ?? "not looked up"})`);
      continue;
    }
    if (out.has(contact.email.toLowerCase())) {
      skipped.push(`${c.name}: ${contact.email} opted out`);
      continue;
    }
    const ref = randomBytes(9).toString("base64url");
    const page = pageLink(c.slug, ref);
    if (!page) fail("outreach draft: SITE.md has neither domain nor url, so there is no page to link", "set domain (or url, after the first deploy) in SITE.md");
    writeDraft(c.slug, { company: c.slug, name: c.name, to: contact.email, person: contact.name ?? null, role: contact.role ?? null, page, ref, subject: "", opener: "", status: "draft", made: today(), body: "\nWhat the subject and opener can draw on: the page, data/companies.json, and records/<slug>.md.\n" });
    made.push(`${c.name}: ${contact.email}${contact.name ? ` (${contact.name})` : ""}`);
  }
  done("outreach draft", `${made.length} drafts made in outreach/`, { lines: [...made, ...skipped], next: made.length ? "the cold-email skill for each, then node scripts/outreach.mjs check" : "node scripts/contacts.mjs find" });
}

if (cmd === "check") {
  noMore(rest, 1, "outreach check");
  const list = rest[0] ? [{ slug: rest[0], d: readDraft(rest[0]) }] : allDrafts().filter((x) => x.d.status === "draft");
  if (rest[0] && !list[0].d) fail(`outreach check: no draft ${rest[0]}`, "node scripts/outreach.mjs list");
  const found = list.flatMap(({ slug, d }) => problems(slug, d).map((p) => `outreach/${slug}.md: ${p}`));
  if (found.length) {
    console.error(`outreach check: ${found.length} findings\n${found.map((f) => `  ${f}`).join("\n")}\n  Try: fix them, then node scripts/outreach.mjs check`);
    process.exit(1);
  }
  done("outreach check", `${list.length} drafts clean`, { next: "show the owner node scripts/outreach.mjs list, and approve only what they say yes to" });
}

if (cmd === "list") {
  noMore(rest, 0, "outreach list");
  const status = flag(a, "status");
  if (status && !STATUSES.includes(status)) misused(`outreach list: --status is one of ${STATUSES.join(", ")}`, "node scripts/outreach.mjs list --status draft");
  const all = allDrafts();
  const rows = all.filter((x) => !status || x.d.status === status);
  const counts = STATUSES.map((s) => `${all.filter((x) => x.d.status === s).length} ${s}`).join(", ");
  done("outreach list", `${rows.length} emails (${counts})`, {
    lines: rows.slice(0, 40).flatMap(({ slug, d }) => [`${d.name} (${slug}), ${d.status}: to ${d.to}${d.person ? `, ${d.person}` : ""}`, `  Subject: ${d.subject || "(not written)"}`, `  ${d.opener || "(no opener yet)"}`, `  Page: ${d.page}`]).concat(rows.length > 40 ? [`40 of ${rows.length}; --status to narrow`] : []),
    ...(all.some((x) => x.d.status === "draft")
      ? { next: "node scripts/outreach.mjs approve <slug>, only for the ones the owner says yes to" }
      : all.some((x) => x.d.status === "approved")
        ? { waits: "node scripts/outreach.mjs send" }
        : { next: all.length ? "node scripts/outreach.mjs visits" : "node scripts/outreach.mjs draft" }),
  });
}

if (cmd === "approve") {
  if (has(a, "all") === Boolean(rest.length)) misused("outreach approve: name the drafts, or --all", "node scripts/outreach.mjs approve <slug>");
  const list = has(a, "all") ? allDrafts().filter((x) => x.d.status === "draft") : rest.map((slug) => ({ slug, d: readDraft(slug) }));
  const missing = list.filter((x) => !x.d).map((x) => x.slug);
  if (missing.length) fail(`outreach approve: no draft ${missing.join(", ")}`, "node scripts/outreach.mjs list --status draft");
  const lines = [];
  let approved = 0;
  for (const { slug, d } of list) {
    if (d.status !== "draft") {
      lines.push(`${d.name}: already ${d.status}, left alone`);
      continue;
    }
    const p = problems(slug, d);
    if (p.length) {
      lines.push(`${d.name}: left as a draft, it ${p.join("; ")}`);
      continue;
    }
    writeDraft(slug, { ...d, status: "approved", approved: today() });
    approved++;
    lines.push(`${d.name}: approved, to ${d.to}`);
  }
  done("outreach approve", `${approved} of ${list.length} approved`, approved ? { lines, waits: "node scripts/outreach.mjs send" } : { lines, next: "node scripts/outreach.mjs list --status draft" });
}

if (cmd === "send") {
  noMore(rest, 0, "outreach send");
  const out = optedOut();
  const approved = allDrafts().filter((x) => x.d.status === "approved");
  for (const x of approved.filter((y) => out.has(String(y.d.to).toLowerCase()))) writeDraft(x.slug, { ...x.d, status: "opted-out" });
  // Checked again: a draft edited after approval, or a contact since blocked, goes back to the owner.
  const recheck = approved.filter((x) => !out.has(String(x.d.to).toLowerCase()));
  const held = recheck.filter((x) => problems(x.slug, x.d).length || readJson(at("raw", x.slug, "contact", "contact.json"))?.verdict !== "valid");
  for (const x of held) writeDraft(x.slug, { ...x.d, status: "draft" });
  const go = recheck.filter((x) => !held.includes(x));
  if (held.length) console.log(`outreach send: ${held.length} approved drafts went back to draft, since they no longer pass check or their contact is no longer sendable: ${held.map((x) => x.slug).join(", ")}`);
  if (!go.length) {
    done("outreach send", "nothing approved to add", { next: "node scripts/outreach.mjs list --status draft" });
    process.exit(0);
  }
  const campaign = String(owner.instantly_campaign ?? "").trim();
  if (!campaign) fail("outreach send: SITE.md names no instantly_campaign", "make the campaign and its sequence in Instantly, then set instantly_campaign in SITE.md to its id");
  const sender = owner.sender ?? {};
  if (!sender.name || !sender.postal_address) fail("outreach send: SITE.md's sender needs a name and a postal_address; every email carries the address", "fill sender in SITE.md");
  const conn = connections().instantly;
  if (!conn) fail("outreach send: Instantly is not connected", 'python3 ~/tools/taskandtool.py request-connection instantly --why "Add approved leads to the cold email campaign"');
  if (!has(a, "confirm")) {
    console.log(`outreach send: ${go.length} approved leads would be added to Instantly campaign ${campaign}`);
    for (const { d } of go.slice(0, 40)) console.log(`  ${d.name}: ${d.to}, "${d.subject}"`);
    console.log("  The campaign sends nothing until the owner starts it in Instantly.");
    console.log("  Nothing was sent. If the owner asked for it: node scripts/outreach.mjs send --confirm");
    process.exit(0);
  }
  const first = (n) => String(n ?? "").split(" ")[0] || null;
  const leads = go.map(({ d }) => ({
    email: d.to,
    first_name: first(d.person),
    company_name: d.name,
    personalization: d.opener,
    custom_variables: { page_url: d.page, subject: d.subject, company_slug: d.company },
  }));
  // In batches of 100 (Instantly takes up to 1,000); it skips anyone on its blocklist or already in the workspace.
  const added = [];
  for (let i = 0; i < leads.length; i += 100) {
    const batch = leads.slice(i, i + 100);
    try {
      await vendor(conn, "/api/v2/leads/add", { method: "POST", body: JSON.stringify({ campaign_id: campaign, skip_if_in_workspace: true, leads: batch }) });
    } catch (e) {
      console.error(`outreach send: Instantly refused the batch from ${batch[0].email}: ${e.message}\n  ${added.length} were added before it and are marked queued`);
      for (const { slug, d } of go.filter((x) => added.includes(x.d.to))) writeDraft(slug, { ...d, status: "queued", queued: today() });
      console.error(e.status === 429 ? "  Try: node scripts/outreach.mjs send --confirm, in a few minutes" : "  Try: node scripts/outreach.mjs send, to see what is left");
      process.exit(1);
    }
    added.push(...batch.map((l) => l.email));
  }
  for (const { slug, d } of go) writeDraft(slug, { ...d, status: "queued", queued: today() });
  done("outreach send", `${go.length} leads added to Instantly campaign ${campaign}`, { lines: ["The campaign sends them once the owner starts it in Instantly."], next: "node scripts/outreach.mjs visits" });
}

if (cmd === "optout") {
  noMore(rest, 1, "outreach optout");
  const email = String(rest[0] ?? "").trim().toLowerCase();
  if (!/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(email)) misused("outreach optout: name the address", "node scripts/outreach.mjs optout owner@larkspur.example");
  if (optedOut().has(email)) {
    done("outreach optout", `${email} opted out already, left alone`, { next: "node scripts/outreach.mjs list --status opted-out" });
    process.exit(0);
  }
  if (!existsSync(OPTOUTS)) writeAtomic(OPTOUTS, "email,on\n");
  appendFileSync(OPTOUTS, `${email},${today()}\n`);
  const hit = allDrafts().filter((x) => String(x.d.to).toLowerCase() === email && x.d.status !== "opted-out");
  for (const x of hit) writeDraft(x.slug, { ...x.d, status: "opted-out" });
  done("outreach optout", `${email} will never be emailed`, { lines: hit.map((x) => `${x.d.name}: draft marked opted-out${x.d.status === "queued" ? "; it is in the Instantly campaign, so remove the lead there too" : ""}`), next: "node scripts/outreach.mjs list --status opted-out" });
}

if (cmd === "visits") {
  noMore(rest, 0, "outreach visits");
  const days = Number(flag(a, "days") ?? 30);
  if (!Number.isInteger(days) || days < 1) misused("outreach visits: --days is a whole number from 1", "node scripts/outreach.mjs visits --days 30");
  const url = machineEnv().DATABASE_URL;
  if (!url) fail("outreach visits: no database yet, so visits are not counted", askForDatabase());
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  let rows;
  try {
    rows = (await pool.query("select slug, ref, count(*)::int as n, min(at) as first, max(at) as last from page_visits where at > now() - make_interval(days => $1) group by slug, ref order by max(at) desc", [days])).rows;
  } catch (e) {
    fail(`outreach visits: the database said ${e.message}`, "npm run migrate");
  } finally {
    await pool.end();
  }
  const drafts = new Map(allDrafts().map((x) => [x.slug, x.d]));
  const names = new Map((readJson(at("data", "companies.json"), []) ?? []).map((c) => [c.slug, c.name]));
  const bySlug = new Map();
  for (const r of rows) bySlug.set(r.slug, [...(bySlug.get(r.slug) ?? []), r]);
  const lines = [...bySlug].map(([slug, rs]) => {
    const d = drafts.get(slug);
    const fromEmail = rs.find((r) => d?.ref && r.ref === d.ref);
    const n = rs.reduce((s, r) => s + r.n, 0);
    return `${names.get(slug) ?? d?.name ?? slug}: ${n} visit${n === 1 ? "" : "s"}, last ${new Date(Math.max(...rs.map((r) => new Date(r.last)))).toISOString().slice(0, 10)}${fromEmail ? `; warm: opened from the email on ${new Date(fromEmail.first).toISOString().slice(0, 10)}` : ""}`;
  });
  done("outreach visits", `${bySlug.size} companies visited in the last ${days} days`, { lines, next: "node scripts/outreach.mjs list --status queued" });
}

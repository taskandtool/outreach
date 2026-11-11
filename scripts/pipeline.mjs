#!/usr/bin/env node
// The state of everything and the machinery that moves it, with no AI:
// status, queue, next, done, retry, tick and upkeep.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { done, fail, flag, has, misused, noMore, out, parseArgs, usage } from "../src/data/cli.mjs";
import { activity, at, bridge, cell, hasBridge, here, log, readCompanies, readJson, sourceHash, walk, withLock, writeCompanies } from "./lib.mjs";

const HELP = `usage: node scripts/pipeline.mjs <command> [options]

  status [--json]
      What is pending at each stage, and what each source returned per company.
  queue --sample N | --all | --company <slug>
      The owner's gate: --sample a mix of large and small companies, --all the
      rest. Starts the "Run the pipeline" job on a machine.
  next company [--json]
      Claims one company with a lock, so jobs never take the same one, and prints
      what to read. "nothing left" is exit 0: the run stops there.
  done company <slug>
      Marks it, once its checks pass: exit 1 prints what to fix.
  retry company <slug> --why "<text>"
      Gives a claimed company back. After three tries it is left failed and
      reported, and the rest carry on.
  tick
      Moves the queue along, with no AI: crawls and gathers what is pending,
      adds the read jobs, rebuilds data/ when reading finishes, removes each job
      when its queue is empty, removes itself when nothing is left. Safe to run
      any time.
  upkeep [--confirm]
      The standing jobs that keep the pages current. Without --confirm it lists
      them and schedules nothing, since some spend connection credits and AI.

Prints what it did, by name, then Next:. Exit 0 done, 1 failed, 2 misused.`;

const a = parseArgs(process.argv.slice(2), { bare: ["all", "confirm"] });
const [cmd, ...rest] = a._;
usage(a, cmd, ["status", "queue", "next", "done", "retry", "tick", "upkeep"], HELP, "pipeline", {
  status: [],
  queue: ["sample", "all", "company"],
  next: [],
  done: [],
  retry: ["why"],
  tick: [],
  upkeep: ["confirm"],
});

const CLAIM_HOURS = 2;
const MAX_TRIES = 3;
const claimStale = (r) => r.state === "claimed" && Date.now() - Date.parse(r.claimed_at || 0) > CLAIM_HOURS * 3600_000;
const countBy = (rows) => rows.reduce((m, r) => ((m[r.state] = (m[r.state] ?? 0) + 1), m), {});

// ---- The jobs ----

const PIPELINE_JOB = "Run the pipeline";
const READ_JOBS = ["Read next company", "Read next company (second)"];
const READ_PROMPT = "Run `node scripts/pipeline.mjs next company`. If it says nothing is left, stop. Otherwise follow the read-company skill for that company.";

const jobsNow = () => (hasBridge() ? bridge(["list-jobs"]).jobs ?? [] : []);
const addJob = (jobs, name, kind, text, when = "*/15 * * * *") => {
  if (!hasBridge() || jobs.some((j) => j.name === name)) return null;
  const r = bridge(["schedule-job", name, "--when", when, `--${kind}`, text]);
  return r.ok === false ? `could not schedule ${name}: ${r.error}` : `scheduled ${name}`;
};
const removeJob = (jobs, name) => {
  const job = jobs.find((j) => j.name === name);
  if (!job) return null;
  const r = bridge(["unschedule-job", String(job.id)]);
  return r.ok === false ? `could not remove ${name}: ${r.error}` : `removed ${name}, its queue is empty`;
};

// ---- status ----

/** How many companies each source gave something for, from each raw/<company>/gather.json. */
function sourceCounts(rows) {
  const counts = {};
  for (const r of rows) {
    const g = readJson(at("raw", r.slug, "gather.json"));
    if (!g) continue;
    for (const [source, v] of Object.entries(g.sources ?? {})) {
      const c = (counts[source] ??= { asked: 0, gave: 0, items: 0, held: 0 });
      c.asked++;
      if (v.status === "ok") c.gave++;
      if (v.status === "held") c.held++;
      c.items += v.items ?? 0;
    }
  }
  return counts;
}

if (cmd === "status") {
  noMore(rest, 0, "pipeline status");
  const rows = readCompanies();
  if (!rows.length) fail("pipeline status: no companies yet", "node scripts/companies.mjs categories --bbox W,S,E,N --search <word>");
  const sources = sourceCounts(rows);
  const failed = rows.filter((r) => r.state === "failed");
  out(has(a, "json"), { companies: countBy(rows), sources, failed: failed.map((r) => ({ slug: r.slug, note: r.note })) }, () =>
    [
      `pipeline status: ${rows.length} companies`,
      `  ${Object.entries(countBy(rows)).map(([k, v]) => `${k} ${v}`).join(", ")}`,
      ...Object.entries(sources).map(([s, c]) => `  ${s}: gave something for ${c.gave} of ${c.asked} companies, ${c.items} items${c.held ? `, ${c.held} matches held for a person` : ""}`),
      ...failed.map((r) => `  failed: ${r.slug}: ${r.note}`),
      "",
      `Next: ${rows.some((r) => r.state === "ready") ? "node scripts/pipeline.mjs next company" : rows.some((r) => r.state === "found") ? "node scripts/pipeline.mjs queue --sample 20, once the owner has said yes" : "node scripts/build-data.mjs"}`,
    ].join("\n"),
  );
}

// ---- queue ----

/** A mix of large and small: the most locations first, then spread evenly through the rest. */
function sampleOf(rows, n) {
  const pool = rows.filter((r) => r.state === "found" && r.website && !r.left_source).sort((x, y) => cell(y, "locations").length - cell(x, "locations").length || Number(y.confidence) - Number(x.confidence));
  const large = pool.filter((r) => cell(r, "locations").length > 1).slice(0, Math.ceil(n / 3));
  const small = pool.filter((r) => !large.includes(r));
  const want = n - large.length;
  const step = small.length / Math.max(want, 1);
  return [...large, ...Array.from({ length: Math.min(want, small.length) }, (_, i) => small[Math.floor(i * step)])];
}

if (cmd === "queue") {
  noMore(rest, 0, "pipeline queue");
  const modes = ["sample", "all", "company"].filter((k) => has(a, k));
  if (modes.length !== 1) misused("pipeline queue: say one of --sample N, --all, --company <slug>", "node scripts/pipeline.mjs queue --sample 20");
  const n = has(a, "sample") ? Number(flag(a, "sample")) : 0;
  if (has(a, "sample") && !(n >= 1)) misused("pipeline queue: --sample is a whole number from 1", "node scripts/pipeline.mjs queue --sample 20");
  const only = flag(a, "company");
  const queued = await withLock(() => {
    const rows = readCompanies();
    if (only && !rows.some((r) => r.slug === only)) fail(`pipeline queue: no company ${only}`, "node scripts/pipeline.mjs status");
    const chosen = only ? rows.filter((r) => r.slug === only) : has(a, "all") ? rows.filter((r) => r.state === "found" && !r.left_source) : sampleOf(rows, n);
    for (const r of chosen) r.state = "queued";
    writeCompanies(rows);
    return chosen;
  });
  const job = addJob(jobsNow(), PIPELINE_JOB, "command", "node scripts/pipeline.mjs tick");
  log(`queue: ${queued.length} companies`);
  done("pipeline queue", `${queued.length} companies queued`, { lines: [...queued.slice(0, 40).map((r) => `${r.name} (${cell(r, "locations").length} locations, ${r.domain || "no site"})`), ...(job ? [job] : [])], next: hasBridge() ? "node scripts/pipeline.mjs status" : "node scripts/pipeline.mjs tick" });
}

// ---- next, done, retry ----

const sayCompany = (name) => {
  if (rest[0] !== "company") misused(`pipeline ${name}: say company`, `node scripts/pipeline.mjs ${name} company`);
};

if (cmd === "next") {
  sayCompany("next");
  noMore(rest, 1, "pipeline next");
  const item = await withLock(() => {
    const rows = readCompanies();
    // A run that died without saying so gets three tries in all, like one that says it failed.
    const dead = rows.filter((r) => claimStale(r) && Number(r.tries || 0) >= MAX_TRIES);
    for (const r of dead) Object.assign(r, { state: "failed", claimed_at: "", note: "its runs stopped without finishing" });
    const row = rows.find((r) => r.state === "ready" || claimStale(r));
    if (dead.length && !row) writeCompanies(rows);
    for (const r of dead) activity(`${r.name} failed three times and is left for a person`);
    if (!row) return null;
    Object.assign(row, { state: "claimed", claimed_at: new Date().toISOString(), tries: String(Number(row.tries || 0) + 1) });
    writeCompanies(rows);
    return row;
  });
  if (!item) {
    out(has(a, "json"), { slug: null }, () => "pipeline next: nothing left to read; stop here");
  } else {
    out(has(a, "json"), { slug: item.slug, name: item.name, website: item.website }, () =>
      [`pipeline next: ${item.name} is yours (${item.slug})`, `  Read: SITE.md, fields.yaml, then raw/${item.slug}/`, `  Write: records/${item.slug}.md`, "", `Next: node scripts/check-record.mjs ${item.slug}, then node scripts/pipeline.mjs done company ${item.slug}`].join("\n"),
    );
  }
}

if (cmd === "done") {
  sayCompany("done");
  noMore(rest, 2, "pipeline done");
  const slug = rest[1];
  if (!slug) misused("pipeline done: name it", "node scripts/pipeline.mjs done company <slug>");
  const check = spawnSync("node", [here("check-record.mjs"), slug], { encoding: "utf8", env: process.env });
  if (check.status !== 0) {
    process.stderr.write(check.stderr || check.stdout);
    process.exit(1);
  }
  const hash = sourceHash(slug);
  const row = await withLock(() => {
    const rows = readCompanies();
    const r = rows.find((x) => x.slug === slug);
    if (r) {
      Object.assign(r, { state: "done", read_hash: hash, note: "", tries: "0", claimed_at: "" });
      writeCompanies(rows);
    }
    return r;
  });
  if (!row) fail(`pipeline done: no company ${slug}`, "node scripts/pipeline.mjs status");
  log(`read ${row.name}: records/${slug}.md`);
  done("pipeline done", `${row.name} read`, { next: "node scripts/pipeline.mjs next company" });
}

if (cmd === "retry") {
  noMore(rest, 2, "pipeline retry");
  const slug = rest[1];
  if (rest[0] !== "company" || !slug) misused("pipeline retry: say company and its name", 'node scripts/pipeline.mjs retry company <slug> --why "..."');
  const why = flag(a, "why") ?? "no reason given";
  const row = await withLock(() => {
    const rows = readCompanies();
    const r = rows.find((x) => x.slug === slug);
    if (r) {
      r.state = Number(r.tries || 0) >= MAX_TRIES ? "failed" : "ready";
      r.note = why.slice(0, 200);
      writeCompanies(rows);
    }
    return r;
  });
  if (!row) fail(`pipeline retry: no company ${slug}`, "node scripts/pipeline.mjs status");
  if (row.state === "failed") {
    log(`failed three times, left for a person: ${row.name}: ${why}`);
    activity(`${row.name} failed its read three times: ${why}`);
  }
  done("pipeline retry", row.state === "failed" ? `${row.name} failed three times and is left for a person` : `${row.name} goes back in the queue`, { next: "node scripts/pipeline.mjs status" });
}

// ---- tick ----

function child(script, args) {
  const r = spawnSync("node", [here(script), ...args], { encoding: "utf8", env: process.env, maxBuffer: 16 * 1024 * 1024 });
  return { ok: r.status === 0, text: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

/** Whether a record is newer than the last build. */
function dataStale() {
  const built = at("data", "companies.json");
  if (!existsSync(built)) return true;
  const stamp = statSync(built).mtimeMs;
  return walk(at("records")).some((f) => statSync(f).mtimeMs > stamp);
}

if (cmd === "tick") {
  noMore(rest, 0, "pipeline tick");
  const lines = [];
  // A refresh that outlasted its job carries on here; the owner already said yes to it.
  const refreshing = readJson(at(".pipeline", "refresh.json"));
  if (refreshing) {
    const r = child("companies.mjs", ["refresh", `--${refreshing.kind}`, "--confirm", "--minutes", "12"]);
    lines.push(r.text.split("\n")[0]);
  }
  const before = readCompanies();
  if (before.some((r) => r.state === "queued")) {
    const r = child("companies.mjs", ["crawl", "--minutes", "12"]);
    lines.push(r.text.split("\n")[0]);
  }
  if (readCompanies().some((r) => r.state === "crawled")) {
    const r = child("companies.mjs", ["gather", "--confirm", "--minutes", "12"]);
    lines.push(r.text.split("\n")[0]);
    for (const l of r.text.split("\n")) if (/^\s*stopped /.test(l)) activity(l.trim());
  }
  let rows = readCompanies();
  const jobs = jobsNow();
  const readable = rows.some((r) => r.state === "ready" || r.state === "claimed");
  for (const name of READ_JOBS) lines.push(readable ? addJob(jobs, name, "prompt", READ_PROMPT) : removeJob(jobs, name));

  const working = rows.some((r) => ["queued", "crawled", "ready", "claimed"].includes(r.state));
  if (!working && walk(at("records")).length && dataStale()) {
    const r = child("build-data.mjs", []);
    lines.push(r.text.split("\n")[0]);
    if (r.ok) activity(`Pages rebuilt: ${r.text.split("\n")[0]}`);
  }

  rows = readCompanies();
  const left = rows.some((r) => ["queued", "crawled", "ready", "claimed"].includes(r.state)) || existsSync(at(".pipeline", "refresh.json"));
  // Work can arrive without a queue (a refresh found changes): whatever is left needs this job to see it through.
  lines.push(left ? addJob(jobsNow(), PIPELINE_JOB, "command", "node scripts/pipeline.mjs tick") : removeJob(jobsNow(), PIPELINE_JOB));
  const said = lines.filter(Boolean);
  if (said.length) log(`tick: ${said.join("; ")}`);
  done("pipeline tick", left ? "work is still queued" : "nothing left to do", { lines: said, next: "node scripts/pipeline.mjs status" });
}

// ---- upkeep ----

if (cmd === "upkeep") {
  noMore(rest, 0, "pipeline upkeep");
  const standing = [
    ["Refresh offers", "0 9 1 * *", "command", "node scripts/companies.mjs refresh --offers --confirm && node scripts/pipeline.mjs tick", "ads and recent posts, monthly; spends ScrapeCreators credits"],
    ["Refresh everything", "0 9 2 1,4,7,10 *", "command", "node scripts/companies.mjs refresh --all --confirm && node scripts/pipeline.mjs tick", "sites, profiles and reviews, quarterly; spends credits"],
    ["Rebuild data", "0 10 * * *", "command", "node scripts/build-data.mjs", "retires expired offers daily, no AI and no spending; deploying stays the owner's"],
    ["Find new businesses", "0 9 3 1,4,7,10 *", "command", "node scripts/companies.mjs find --latest", "quarterly, free; new ones wait for a queue"],
    ["Audit", "0 12 5 * *", "prompt", "Follow the cross-check skill's monthly audit.", "monthly; each run costs a full AI turn"],
  ];
  if (!has(a, "confirm")) {
    console.log(`pipeline upkeep: ${standing.length} jobs would be scheduled`);
    for (const [name, when, , , what] of standing) console.log(`  ${name} (${when}): ${what}`);
    console.log("  Nothing was scheduled. If the owner asked for it: node scripts/pipeline.mjs upkeep --confirm");
  } else {
    if (!hasBridge()) fail("pipeline upkeep: there is no machine to schedule on here", "run it on the app's machine");
    const jobs = jobsNow();
    const lines = standing.map(([name, when, kind, text]) => addJob(jobs, name, kind, text, when) ?? `${name}: already scheduled, left alone`);
    done("pipeline upkeep", `${standing.length} standing jobs`, { lines, next: "python3 ~/tools/taskandtool.py list-jobs" });
  }
}

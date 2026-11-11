// What the pipeline's scripts share: where the app's files are, companies.csv,
// the lock, front matter, the log, the bridge and the gateway.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { machineEnv, parseArgs, plain } from "../src/data/cli.mjs";

/** The app's root: SITE_ROOT for a test or a sample kept apart, else this repository. */
export const ROOT = resolve(process.env.SITE_ROOT || join(dirname(fileURLToPath(import.meta.url)), ".."));
export const at = (...p) => join(ROOT, ...p);
/** A file of this repository, wherever the working folder is. */
export const here = (...p) => join(dirname(fileURLToPath(import.meta.url)), ...p);

export const today = (flag) => flag || new Date().toISOString().slice(0, 10);

/** Every file under a folder. */
export const walk = (dir) =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((e) => {
        const p = join(dir, e);
        return e === "node_modules" ? [] : statSync(p).isDirectory() ? walk(p) : [p];
      });

export const readJson = (p, fallback = null) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
};

/** Written whole or not at all, so a stop halfway never leaves half a file. */
export function writeAtomic(p, text) {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, p);
}
export const writeJson = (p, v) => writeAtomic(p, `${JSON.stringify(v, null, 2)}\n`);

/** The slug a name becomes in a file name and an address. */
export const slugify = (s) =>
  String(s)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ---- CSV: companies.csv ----

const quote = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [head, ...body] = rows;
  if (!head) return [];
  return body.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const toCsv = (columns, rows) => [columns.join(","), ...rows.map((r) => columns.map((c) => quote(r[c])).join(","))].join("\n") + "\n";

const COMPANY_COLUMNS = ["slug", "name", "website", "domain", "phones", "emails", "socials", "categories", "source", "confidence", "locations", "state", "tries", "claimed_at", "read_hash", "found_at", "left_source", "site_failures", "note"];

export const readCompanies = () => (existsSync(at("companies.csv")) ? parseCsv(readFileSync(at("companies.csv"), "utf8")) : []);
export const writeCompanies = (rows) => writeAtomic(at("companies.csv"), toCsv(COMPANY_COLUMNS, rows));
export const cell = (row, key, fallback = []) => {
  try {
    return row[key] ? JSON.parse(row[key]) : fallback;
  } catch {
    return fallback;
  }
};

// ---- The lock: one writer of the state files at a time ----

const STALE_MS = 10 * 60 * 1000;

/** Runs fn holding the lock; a lock left by a process that died goes stale after ten minutes. */
export async function withLock(fn) {
  const file = at(".pipeline", "lock");
  mkdirSync(dirname(file), { recursive: true });
  for (let tries = 0; ; tries++) {
    try {
      closeSync(openSync(file, "wx"));
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let age = 0;
      try {
        age = Date.now() - statSync(file).mtimeMs;
      } catch {
        continue;
      }
      if (age > STALE_MS) rmSync(file, { force: true });
      else if (tries > 300) throw new Error("the state files stayed locked for a minute; another pipeline command is running");
      else await new Promise((r) => setTimeout(r, 200));
    }
  }
  // A fail() inside exits the process, past any finally.
  const letGo = () => rmSync(file, { force: true });
  process.once("exit", letGo);
  try {
    return await fn();
  } finally {
    process.off("exit", letGo);
    rmSync(file, { force: true });
  }
}

/** Reads companies.csv under the lock, lets fn change a row, writes it back. */
export const updateCompany = (slug, change) =>
  withLock(() => {
    const rows = readCompanies();
    const row = rows.find((r) => r.slug === slug);
    if (row) {
      change(row);
      writeCompanies(rows);
    }
    return row;
  });

// ---- Notes ----

/** A record's front matter and body; null when it has none or it does not parse. */
export function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  try {
    return { data: parseYaml(m[1]) ?? {}, body: m[2] };
  } catch (e) {
    return { error: e.message, data: {}, body: m[2] };
  }
}

export function readYaml(p, fallback = {}) {
  try {
    return parseYaml(readFileSync(p, "utf8")) ?? fallback;
  } catch {
    return fallback;
  }
}

/** One dated line in log.md, which only grows. */
export const log = (line, day) => appendFileSync(at("log.md"), `- ${today(day)}: ${line}\n`);

// ---- Fingerprints: has what we gathered on a company changed? ----

/** What each fetch stamps afresh, and a rating or a follower count, which move all the time: none of it is worth a new read. */
const STAMPED = /^(fetched|fetcher|hash): .*$|^- \*\*Rating:\*\* .*$|^.*\bFollowers: \d+.*$/gm;

/** One hash of the words gathered: the .md of every source, and of the crawler's summaries only the text every page repeats. */
export function sourceHash(slug) {
  const h = createHash("sha256");
  const files = walk(at("raw", slug)).filter((f) => f.endsWith(".md") && !/\/_cache\//.test(f) && (!f.includes("/_index/") || f.endsWith("/_index/common.md"))).sort();
  for (const f of files) {
    h.update(relative(ROOT, f));
    h.update(readFileSync(f, "utf8").replace(STAMPED, ""));
  }
  return h.digest("hex").slice(0, 16);
}

// ---- The machine ----

const BRIDGE = process.env.TT_BRIDGE || join(homedir(), "tools", "taskandtool.py");
export const hasBridge = () => existsSync(BRIDGE);

/** A bridge command; `{ ok, ... }`, never a throw. Off a machine it answers ok: false. */
export function bridge(args) {
  if (!hasBridge()) return { ok: false, error: "no bridge on this computer" };
  const r = spawnSync("python3", [BRIDGE, ...args, "--json"], { encoding: "utf8" });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { ok: false, error: (r.stderr || r.stdout || "the bridge did not answer").trim() };
  }
}

export const activity = (line) => bridge(["post-activity", line]);

/** The slugs this app holds, by provider: from the bridge on a machine. */
export function connections() {
  const r = bridge(["list-connections"]);
  const out = {};
  for (const c of r.connections ?? []) if (c.slug && c.gateway_url && (c.status ?? "active") === "active") out[c.provider] ??= c.slug;
  return out;
}

/**
 * A call to a vendor through the gateway. The JSON body, or a thrown error
 * naming the vendor's status: the caller decides whether the source stops.
 */
export async function vendor(slug, path, init = {}) {
  const env = machineEnv();
  const base = (env.PHOENIX_URL ?? "").replace(/\/+$/, "");
  const token = env.MACHINE_TOKEN;
  const res = await fetch(`${base}/api/machine/gateway/${slug}${path}`, {
    ...init,
    headers: { "x-api-key": token, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error(`${slug} answered ${res.status}: ${text.slice(0, 200)}`);
    e.status = res.status;
    e.refusal = res.headers.get("x-tasktool-refusal");
    throw e;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${slug} did not answer JSON: ${text.slice(0, 200)}`);
  }
}

/** A program on the PATH, or by its --flag-free version check. */
export const hasCommand = (name) => {
  try {
    execFileSync("sh", ["-c", `command -v ${name}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/**
 * A script with no subcommand's arguments, checked before it does anything:
 * --help prints `help` and exits 0; a flag it does not take, or an argument
 * when it takes none, exits 2 with a Try line.
 */
export function start(script, help, { flags = [], bools = [], args = false, tryHelp = `node scripts/${script}.mjs --help` } = {}) {
  const a = parseArgs(process.argv.slice(2), { bare: bools });
  plain(a, help, script, { flags: [...flags, ...bools], args, tryCmd: tryHelp });
  return a;
}

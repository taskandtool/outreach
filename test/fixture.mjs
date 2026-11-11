// A small working folder for a test: one niche, companies and what was gathered on them.
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));

export function folder() {
  const dir = mkdtempSync(join(tmpdir(), "outreach-"));
  const put = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof text === "string" ? text : JSON.stringify(text));
  };
  put("SITE.md", '---\nname: Test Register\nniche: test companies\nnoun: test companies\ngate:\n  company_facts: 2\n---\n\nRules.\n');
  put("fields.yaml", "services:\n  - replacement: a whole system\n  - repair: fixing one\nguarantee_kinds: [labor, parts]\noffer_kinds: [discount]\nproof_kinds: [license]\ndetails:\n  - financing: terms\n");
  const run = (script, args = [], env = {}) =>
    new Promise((done) => {
      execFile(process.execPath, [`scripts/${script}`, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, SITE_ROOT: dir, TT_BRIDGE: join(dir, "no-bridge"), ...env } }, (err, stdout, stderr) =>
        done({ status: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr }),
      );
    });
  return { dir, put, run };
}

const COLUMNS = "slug,name,website,domain,phones,emails,socials,categories,source,confidence,locations,state,tries,claimed_at,read_hash,found_at,left_source,site_failures,note";
const row = (o) => COLUMNS.split(",").map((c) => {
  const v = o[c] ?? "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(",");
export const csv = (...rows) => `${COLUMNS}\n${rows.map(row).join("\n")}\n`;

/** A company with one page of site text, ready to be read. */
export function company(f, slug, page, extra = {}) {
  f.put(`raw/${slug}/site/pages/index.md`, `---\nurl: "https://${slug}.example/"\ntitle: "Home"\nfetched: "2026-01-01T00:00:00Z"\nhash: "abc"\n---\n\n${page}\n`);
  f.put(`raw/${slug}/site/_index/business-card.json`, { name: slug, telephone: "(512) 555-0100", same_as: [], logo: null, ...extra.card });
  f.put(`raw/${slug}/site/_index/facts.json`, { phone: [{ value: "(512) 555-0100", sources: [] }], email: [], hours: [], action: [], ratings: [] });
  f.put(`raw/${slug}/site/_index/run.json`, { read: 1, finished: "2026-01-01T00:00:00Z" });
}

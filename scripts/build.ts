// Builds the site for production:
//   dist/             each company's page pre-rendered to <slug>.html, the static
//                     files and pictures, and robots.txt; no index.html, so "/" reaches the Worker
//   build/worker.mjs  "/" by host, quote requests, visits and the 404 page
// `npm run deploy` runs it too.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { build } from "esbuild";
import { done, fail } from "../src/data/cli.mjs";
import { at, start } from "./lib.mjs";

start("build", `usage: npm run build

Compiles SITE.md's settings and the CSS, pre-renders each company's page in data/ to
dist/, and bundles the Worker to build/worker.mjs. Prints one line of what it built. A
failure says which step, on stderr, and exits 1.`, { tryHelp: "npm run build -- --help" });

const dist = at("dist");

function run(step: string, cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: "utf8", env: process.env });
  if (r.status !== 0) fail(`build: the ${step} step failed\n${`${r.stdout || ""}${r.stderr || ""}`.trim()}`, `npm run ${step}`);
}

run("content", "node", ["scripts/content.mjs"]);
run("css", "npm", ["run", "--silent", "css"]);

const { default: app, routes, robots } = await import("../src/app");
const all = routes();
const paths = new Set<string>();
for (const r of all) {
  if (paths.has(r.page.path)) fail(`build: two pages claim ${r.page.path}`, "two names slug to the same address: merge them in aliases.yaml");
  paths.add(r.page.path);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync("static", dist, { recursive: true });
if (existsSync(at("static", "media"))) cpSync(at("static", "media"), join(dist, "media"), { recursive: true });

for (const r of all) {
  const res = await app.request(r.page.path);
  if (res.status !== 200) fail(`build: ${r.page.path} rendered with status ${res.status}`, `curl -si http://localhost:3000${r.page.path} | head -20`);
  const file = `${r.page.path.slice(1)}.html`;
  mkdirSync(dirname(join(dist, file)), { recursive: true });
  writeFileSync(join(dist, file), await res.text());
}
const nf = await app.request("/this-page-does-not-exist");
writeFileSync(join(dist, "404.html"), await nf.text());
writeFileSync(join(dist, "robots.txt"), robots());

mkdirSync(at("build"), { recursive: true });
try {
  await build({
    entryPoints: ["src/worker.ts"],
    bundle: true,
    format: "esm",
    outfile: at("build", "worker.mjs"),
    platform: "browser",
    conditions: ["workerd", "worker", "browser"],
    target: "es2022",
    jsx: "automatic",
    jsxImportSource: "hono/jsx",
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
} catch (e) {
  fail(`build: the Worker did not bundle\n${e instanceof Error ? e.message : String(e)}`, "npm run check, which finds a Node import the Worker reaches");
}

done("build", `${all.length} company pages + 404 to dist/, Worker to build/worker.mjs`, { next: "npm run check -- --built" });

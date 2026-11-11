#!/usr/bin/env node
// The development loop in one process: Tailwind rebuilding static/site.css and the
// server restarting when src/ changes. data/ is read again on each refresh. This is
// what the `web` service runs on a Task & Tool machine.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, watchFile } from "node:fs";
import { fail } from "../src/data/cli.mjs";
import { at, start } from "./lib.mjs";

start("dev", `usage: npm run dev

The web service's command, running until stopped: SITE.md's settings compiled (and
again whenever it changes), the tables set up, Tailwind rebuilding the CSS and the
server on localhost:3000 restarting on every change. Its output is the service log.`);

for (const b of ["node_modules/.bin/tailwindcss", "node_modules/.bin/tsx"]) {
  if (!existsSync(b)) fail(`dev: ${b} is missing`, "npm install, then npm run dev");
}

spawnSync("node", ["scripts/content.mjs"], { stdio: "inherit" });
spawnSync("node_modules/.bin/tsx", ["scripts/migrate.ts"], { stdio: "inherit" });
// The server, restarted on its own when SITE.md changes: its settings are compiled into
// src/generated/site.json, which the server reads once when it starts.
const serve = () => spawn("node_modules/.bin/tsx", ["watch", "--clear-screen=false", "src/server.ts"], { stdio: "inherit" });
const children = {
  // `--watch=always` keeps watching when stdin is closed, as it is under a service.
  css: spawn("npm", ["run", "--silent", "css:watch"], { stdio: "inherit" }),
  web: serve(),
};

let stopping = false;
let restarting = false;
const stop = (signal, code) => {
  if (stopping) return;
  stopping = true;
  for (const c of Object.values(children)) c.kill(signal);
  process.exit(code ?? 0);
};
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => stop(s, 0));
// If either half dies, take the other down so the service restarts cleanly; a restart we asked for is not a death.
const watch = (name) =>
  children[name].on("exit", (code) => {
    if (name === "web" && restarting) {
      restarting = false;
      children.web = serve();
      watch("web");
    } else stop("SIGTERM", code ?? 1);
  });
watch("css");
watch("web");

watchFile(at("SITE.md"), { interval: 1000 }, () => {
  spawnSync("node", ["scripts/content.mjs"], { stdio: "inherit" });
  restarting = true;
  children.web.kill("SIGTERM");
});

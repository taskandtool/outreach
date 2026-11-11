#!/usr/bin/env node
// The tests: `npm test`. Every *.test under test/, and those the shared code
// arrives with: Node's test runner through tsx.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fail } from "../src/data/cli.mjs";
import { start, walk } from "./lib.mjs";

start("test", `usage: npm test

Runs every *.test.ts, .tsx and .mjs under src/, test/ and the tropes skill, and
prints one line: passed, failed, skipped. A failure prints its details on stderr first.`);

const files = ["src", "test", ".claude/skills/tropes/test"].filter(existsSync).flatMap(walk).filter((f) => /\.test\.(tsx?|mjs)$/.test(f));
const run = spawnSync("node", ["--import", "tsx", "--test", "--test-reporter=tap", ...files], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const tap = `${run.stdout || ""}${run.stderr || ""}`;
const n = (k) => Number((tap.match(new RegExp(`^# ${k} (\\d+)`, "m")) || [])[1] || 0);
const summary = `${n("pass")} passed, ${n("fail")} failed${n("skipped") ? `, ${n("skipped")} skipped` : ""} in ${files.length} file(s)`;
if (run.status !== 0) {
  const failures = tap.split(/\n(?=\s*(?:not )?ok \d)/).filter((b) => /^\s*not ok/.test(b));
  console.error(failures.join("\n").trim() || tap.trim().split("\n").slice(-40).join("\n"));
  fail(`test: ${summary}`, "node --import tsx --test <file>, for one file's whole output");
}
console.log(`test: ${summary}`);

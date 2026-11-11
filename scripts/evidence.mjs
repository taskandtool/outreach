// What was gathered on a company, as text a quote can be traced to. Shared by
// the record check and the build, which retires an offer whose words are gone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { at, readJson, walk } from "./lib.mjs";

/** Case, spacing, markdown's marks and typographers' quotes don't count. */
export const squash = (s) =>
  String(s)
    .normalize("NFKC")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|\\]/g, "")
    .replace(/&amp;/g, "&")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const sameUrl = (u) =>
  String(u ?? "")
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");

/** Every readable file gathered on a company, each with the address it speaks for. The text every page repeats speaks for them all. */
export function loadSources(slug) {
  const root = at("raw", slug);
  const matches = readJson(join(root, "matches.json"), []);
  const blocked = new Set(matches.filter((m) => m.status === "held" || m.status === "rejected").map((m) => m.network));
  if (readJson(join(root, "gather.json"))?.sources?.["google listing"]?.status === "held") blocked.add("places");
  const files = walk(root).filter((f) => /\.md$/.test(f) && !/\/_cache\//.test(f));
  const blocks = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // An ad library sits under ads/<network>, and answers to that network's match.
    const [top, sub] = file.slice(root.length + 1).split("/");
    const network = top === "ads" ? sub.replace(/\.md$/, "") : top;
    // A vendor's .md holds one block per post or ad; a page or document is one block.
    const parts = text.split(/\n(?=## )/);
    const pageUrl = text.match(/^url:\s*"?([^"\n]+)"?/m)?.[1]
      ?? text.match(/^<!-- source:\s*(https?:\/\/\S+)\s*-->\s*$/m)?.[1];
    for (const part of parts) {
      blocks.push({ file: file.slice(root.length + 1), held: blocked.has(network), everyPage: file.endsWith("/_index/common.md"), url: part.match(/^url:\s*"?([^"\n]+)"?/m)?.[1] ?? pageUrl ?? "", text: squash(part) });
    }
  }
  return blocks;
}

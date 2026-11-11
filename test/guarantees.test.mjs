import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeGuarantees } from "../src/guarantees.ts";

const g = (kind, length, covers, conditions = null) => ({ kind, length, covers, conditions, quote: "q", url: "https://a.example/", where: "site" });

test("three labor sentences are one labor guarantee, with a line each and no repeats", () => {
  const out = mergeGuarantees([g("labor", "1 year", "labor on any repair"), g("labor", null, "AC installation workmanship"), g("labor", null, "repair workmanship; return visit if not fixed right"), g("labor", null, "AC installation workmanship"), g("parts", "1 year", "parts on any repair")]);
  assert.deepEqual(out.map((x) => x.name), ["Labor guarantee", "Parts guarantee"]);
  assert.deepEqual(out[0].lines, ["1 year: labor on any repair", "AC installation workmanship", "Repair workmanship; return visit if not fixed right"]);
  assert.equal(out[0].length, null);
  assert.equal(out[1].length, "1 year", "one sentence keeps its length large");
  assert.deepEqual(out[1].lines, ["Parts on any repair"]);
});

test("terms carry from any sentence in the group, and an unusual promise stands alone", () => {
  const out = mergeGuarantees([g("labor", null, "a"), g("labor", "2 years", "b", "a maintenance plan"), g("other", null, "3-hour service window"), g("other", null, "Price match")]);
  assert.equal(out[0].terms.conditions, "a maintenance plan");
  assert.deepEqual(out.slice(1).map((x) => x.name), ["3-hour service window", "Price match"]);
  assert.deepEqual(out[1].lines, []);
});

test("a promise is what the card says; notes about evidence are only a fallback", () => {
  const out = mergeGuarantees([{ ...g("labor", "1 year", "labor on any repair"), promise: "1 year on any repair, and a return visit if it isn't right" }, { ...g("other", null, "a note"), promise: "A 3-hour service window" }]);
  assert.deepEqual(out[0].lines, ["1 year on any repair, and a return visit if it isn't right"]);
  assert.equal(out[0].length, null, "the promise already says it");
  assert.equal(out[1].name, "A 3-hour service window");
});

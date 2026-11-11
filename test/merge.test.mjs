import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCity, cleanWebsite, mergePlaces } from "../scripts/merge.mjs";

const place = (over) => ({ name: "A", website: "", domain: "", phones: [], emails: [], socials: [], categories: [], source: "overture", confidence: 0.9, locations: [{ address: "", city: "", lat: 30, lng: -97 }], ...over });

test("one domain or one phone makes one company, with each spot a location", () => {
  const merged = mergePlaces([
    place({ name: "Thistlecove Air", domain: "cool.example", website: "https://cool.example", locations: [{ lat: 30, lng: -97 }] }),
    place({ name: "Thistlecove Air Round Rock", domain: "cool.example", website: "https://cool.example/rr", locations: [{ lat: 30.5, lng: -97.5 }] }),
    place({ name: "Other", phones: ["5125550100"], locations: [{ lat: 31, lng: -97 }] }),
    place({ name: "Other LLC", phones: ["5125550100"], locations: [{ lat: 31.5, lng: -97 }] }),
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((c) => c.domain === "cool.example").locations.length, 2);
  assert.equal(merged.find((c) => c.domain === "cool.example").website, "https://cool.example");
});

test("the same name with two sites stays two unless they share a spot; a name with no site joins its namesake", () => {
  const far = mergePlaces([place({ name: "Two Rivers", domain: "a.example", locations: [{ lat: 30, lng: -97 }] }), place({ name: "Two Rivers", domain: "b.example", locations: [{ lat: 31, lng: -98 }] })]);
  assert.equal(far.length, 2);
  const joined = mergePlaces([place({ name: "Fernway LLC", domain: "g.example" }), place({ name: "Fernway", locations: [{ lat: 40, lng: -90 }] })]);
  assert.equal(joined.length, 1);
});

test("a profile or listing page is not a company's own site", () => {
  for (const u of ["https://www.facebook.com/x", "https://hub.biz/x", "https://x.hub.biz", "https://www.yelp.com/biz/a"]) assert.equal(cleanWebsite(u).website, "", u);
  assert.deepEqual(cleanWebsite("http://WWW.Cool.example/austin/?utm_source=x"), { website: "https://www.cool.example/austin", domain: "cool.example" });
  assert.equal(cleanWebsite("jlpumping.example").domain, "jlpumping.example");
});

test("a city reads as its plain name", () => {
  assert.equal(cleanCity("Leander TX"), "Leander");
  assert.equal(cleanCity("PFLUGERVILLE"), "Pflugerville");
  assert.equal(cleanCity("round rock"), "Round Rock");
});

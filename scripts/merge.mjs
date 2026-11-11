// Telling two rows are one company: pure, so tests reach it without running a command.
import { slugify } from "./lib.mjs";

// A profile or a listing page is not the company's own site; the row keeps
// its social link and has no website to crawl.
const NOT_A_SITE = /(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|youtube|yelp|yellowpages|bbb|angi|homeadvisor|thumbtack|nextdoor|linktr|hub|google|goo|business\.site|wixsite|homesteadcloud|mapquest|manta|porch|houzz)\.[a-z.]+$/;

export function cleanWebsite(raw) {
  if (!raw) return { website: "", domain: "" };
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const domain = u.hostname.toLowerCase().replace(/^www\./, "");
    if (NOT_A_SITE.test(domain) || !domain.includes(".")) return { website: "", domain: "" };
    return { website: `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`, domain };
  } catch {
    return { website: "", domain: "" };
  }
}

export const cleanPhone = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.length === 11 && d[0] === "1" ? d.slice(1) : d.length >= 7 ? d : "";
};
export const nameKey = (s) =>
  slugify(s)
    .replace(/-(inc|llc|ltd|co|corp|company|the)(?=-|$)/g, "")
    .replace(/^the-/, "");
const near = (x, y) => x.lat != null && y.lat != null && Math.abs(x.lat - y.lat) < 0.002 && Math.abs(x.lng - y.lng) < 0.002;

/** "Leander TX" and "PFLUGERVILLE" as the city's plain name. */
export const cleanCity = (s) =>
  String(s ?? "")
    .replace(/,?\s+[A-Z]{2}$/, "")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());

/** Places into companies: one domain, one phone, or one name in one spot make one. */
export function mergePlaces(places) {
  const parent = places.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const join = (i, j) => (parent[root(i)] = root(j));
  const seen = new Map();
  const claim = (key, i) => {
    if (!key) return;
    if (seen.has(key)) join(i, seen.get(key));
    else seen.set(key, i);
  };
  places.forEach((p, i) => {
    claim(p.domain && `d:${p.domain}`, i);
    for (const ph of p.phones) claim(`p:${ph}`, i);
  });
  places.forEach((p, i) => {
    places.forEach((q, j) => {
      if (j <= i || nameKey(p.name) !== nameKey(q.name)) return;
      // The same name with no site of its own to tell them apart is one company; two sites need one spot.
      if (!p.domain || !q.domain || p.locations.some((x) => q.locations.some((y) => near(x, y)))) join(i, j);
    });
  });
  const groups = new Map();
  places.forEach((p, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), p]));
  return [...groups.values()].map((group) => {
    const best = [...group].sort((x, y) => y.confidence - x.confidence)[0];
    const withSite = group.filter((p) => p.domain).sort((x, y) => y.confidence - x.confidence || x.website.length - y.website.length)[0];
    const locations = [];
    for (const l of group.flatMap((p) => p.locations)) if (!locations.some((x) => near(x, l))) locations.push(l);
    const uniq = (k) => [...new Set(group.flatMap((p) => p[k]))];
    return { name: best.name, website: withSite?.website ?? "", domain: withSite?.domain ?? "", phones: uniq("phones"), emails: uniq("emails"), socials: uniq("socials"), categories: uniq("categories"), source: [...new Set(group.map((p) => p.source))].join("+"), confidence: best.confidence, locations };
  });
}


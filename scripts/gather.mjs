// What companies.mjs gather and refresh call: every source other than the
// company's own site, one company at a time, each saved to raw/<company>/ so it
// is never paid for twice. A profile is used only once it is confirmed as this
// company (raw/<company>/matches.json). Each vendor answer is kept as JSON, and
// its words go to a .md beside it: that is what the AI reads, what quotes are
// checked against, and what tells a refresh whether anything changed.
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamTo } from "node:stream/promises";
import { machineEnv } from "../src/data/cli.mjs";
import { cleanPhone, cleanWebsite } from "./merge.mjs";
import { at, cell, connections, readJson, vendor, writeAtomic, writeJson } from "./lib.mjs";

const SC = "scrapecreators";
const MAX_PICTURES = 12;
const REVIEW_DEPTH = 100;

/** The sources this app can use now: { places, scrapecreators, dataforseo } with each one's slug. */
export function availableSources() {
  const held = connections();
  const out = {};
  if (held["google-places"]) out.places = held["google-places"];
  else if (process.env.GOOGLE_PLACES_API_KEY) out.places = "key";
  if (held.scrapecreators) out.scrapecreators = held.scrapecreators;
  if (held.dataforseo) out.dataforseo = held.dataforseo;
  return out;
}

/** The most this would spend, for the owner's yes. */
export function gatherPlan(rows, sources, again = "all") {
  const n = rows.length;
  return {
    credits: sources.scrapecreators ? n * (again === "offers" ? 4 : 10) : 0,
    places: sources.places && again !== "offers" ? n : 0,
    reviews: sources.dataforseo && again !== "offers" ? n : 0,
  };
}

// ---- Which profiles are this company ----

const PROFILE = {
  facebook: (u) => (/facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)/i.test(u) ? u : null),
  instagram: (u) => u.match(/instagram\.com\/([A-Za-z0-9_.]+)/i)?.[1] ?? null,
  linkedin: (u) => (/linkedin\.com\/company\/[^/?#]+/i.test(u) ? u : null),
  tiktok: (u) => u.match(/tiktok\.com\/@([A-Za-z0-9_.]+)/i)?.[1] ?? null,
};
const networkOf = (u) => Object.keys(PROFILE).find((n) => PROFILE[n](u));

const siteCard = (slug) => readJson(at("raw", slug, "site", "_index", "business-card.json"), {});

/** What ties a fetched profile to the company: its website's domain, or a phone we already hold. */
function confirmedBy(row, card, profile) {
  const domain = cleanWebsite(profile.website ?? "").domain;
  if (domain && row.domain && domain === row.domain) return `its website is ${domain}`;
  const phones = new Set([...cell(row, "phones"), cleanPhone(card.telephone)].filter(Boolean));
  const phone = cleanPhone(profile.phone);
  if (phone && phones.has(phone)) return `its phone ${phone} matches`;
  return null;
}

/**
 * The profiles worth asking about. The company's own site linking to one is
 * enough; one known only from a listing has to prove itself once fetched. A
 * person's decision in matches.json (`decided: person`) always stands.
 */
function matchList(row, slug) {
  const saved = readJson(at("raw", slug, "matches.json"), []);
  const list = [...saved];
  const add = (url, status, why) => {
    const network = networkOf(url);
    if (!network || list.some((m) => m.network === network)) return;
    list.push({ network, url, status, why });
  };
  for (const url of siteCard(slug).same_as ?? []) add(url, "confirmed", "the company's site links to it");
  for (const url of cell(row, "socials")) add(url, "unchecked", "a business listing names it");
  return list;
}

/** Fetches a profile to check it; held for a person if nothing ties it to the company. */
function settle(match, row, card, profile) {
  if (match.status !== "unchecked" || match.decided) return;
  const why = confirmedBy(row, card, profile);
  match.status = why ? "confirmed" : "held";
  match.why = why ?? `nothing ties it to ${row.name}: neither its website nor its phone matches`;
}

// ---- Saving ----

const save = (slug, name, json, words) => {
  writeJson(at("raw", slug, `${name}.json`), json);
  writeAtomic(at("raw", slug, `${name}.md`), words);
};
const had = (slug, name) => existsSync(at("raw", slug, `${name}.json`));
const day = (seconds) => (seconds ? new Date(Number(seconds) * 1000).toISOString().slice(0, 10) : "");

/** Each picture downloaded as it is found, since a vendor's address expires. Failures are left out. */
async function pictures(slug, source, urls) {
  const dir = at("raw", slug, source, "images");
  let saved = 0;
  for (const url of urls.filter((u) => /^https:\/\//.test(u ?? "")).slice(0, MAX_PICTURES)) {
    const file = join(dir, `${String(saved + 1).padStart(2, "0")}.jpg`);
    if (existsSync(file)) {
      saved++;
      continue;
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) continue;
      mkdirSync(dirname(file), { recursive: true });
      await streamTo(Readable.fromWeb(res.body), createWriteStream(file));
      saved++;
    } catch {
      // A picture that will not download is simply not used.
    }
  }
  return saved;
}

// ---- Each source. Each takes what it needs and returns { items } ----

const fetchers = {
  async facebook(slug, m, again, confirm) {
    const url = encodeURIComponent(m.url);
    const name = "facebook/profile";
    let p = readJson(at("raw", slug, `${name}.json`));
    if (!p || again === "all") {
      p = await vendor(SC, `/v1/facebook/profile?url=${url}`);
      if (confirm(p, { website: p.website, phone: p.phone })) return { held: true };
      save(slug, name, p, [`# ${p.name ?? "Facebook page"} on Facebook`, `url: ${p.url ?? m.url}`, p.pageIntro, p.category && `Category: ${p.category}`, p.address && `Address: ${p.address}`, p.phone && `Phone: ${p.phone}`, p.email && `Email: ${p.email}`, p.website && `Website: ${p.website}`, p.followerCount != null && `Followers: ${p.followerCount}`].filter(Boolean).join("\n") + "\n");
      await pictures(slug, "facebook/logo", [p.profilePicLarge]);
    }
    if (!had(slug, "facebook/photos") || again === "all") {
      const photos = await vendor(SC, `/v1/facebook/profile/photos?url=${url}`);
      writeJson(at("raw", slug, "facebook", "photos.json"), photos);
      await pictures(slug, "facebook", (photos.photos ?? []).map((x) => x.viewer_image?.uri));
    }
    let items = 1;
    if (!had(slug, "facebook/posts") || again) {
      const posts = await vendor(SC, `/v1/facebook/profile/posts?url=${url}`);
      const list = posts.posts ?? [];
      items += list.length;
      save(slug, "facebook/posts", posts, list.map((x) => `## ${day(x.publishTime)}\nurl: ${x.url ?? x.permalink ?? m.url}\n\n${x.text ?? ""}\n`).join("\n"));
    }
    return { items, pageId: p.id };
  },

  async instagram(slug, m, again, confirm) {
    const handle = PROFILE.instagram(m.url);
    let p = readJson(at("raw", slug, "instagram", "profile.json"));
    if (!p || again === "all") {
      p = await vendor(SC, `/v1/instagram/profile?handle=${encodeURIComponent(handle)}`);
      const u = p.data?.user ?? {};
      if (confirm(p, { website: u.external_url, phone: u.business_phone_number })) return { held: true };
      save(slug, "instagram/profile", p, [`# @${handle} on Instagram`, `url: https://www.instagram.com/${handle}/`, u.biography, u.external_url && `Website: ${u.external_url}`, u.edge_followed_by?.count != null && `Followers: ${u.edge_followed_by.count}`].filter(Boolean).join("\n") + "\n");
      await pictures(slug, "instagram/logo", [u.profile_pic_url_hd ?? u.profile_pic_url]);
    }
    let items = 1;
    if (!had(slug, "instagram/posts") || again) {
      const posts = await vendor(SC, `/v2/instagram/user/posts?handle=${encodeURIComponent(handle)}`);
      const list = posts.items ?? [];
      items += list.length;
      save(slug, "instagram/posts", posts, list.map((x) => `## ${day(x.taken_at)}\nurl: ${x.url ?? `https://www.instagram.com/p/${x.code}/`}\n\n${x.caption?.text ?? ""}\n`).join("\n"));
      await pictures(slug, "instagram", list.map((x) => x.display_uri ?? x.image_versions2?.candidates?.[0]?.url));
    }
    return { items };
  },

  async linkedin(slug, m, again, confirm) {
    if (had(slug, "linkedin/company") && again !== "all") return { items: 1 };
    const p = await vendor(SC, `/v1/linkedin/company?url=${encodeURIComponent(m.url)}`);
    if (confirm(p, { website: p.website })) return { held: true };
    save(slug, "linkedin/company", p, [`# ${p.name ?? "Company"} on LinkedIn`, `url: ${m.url}`, p.slogan, p.description, p.founded && `Founded: ${p.founded}`, p.size && `Size: ${p.size}`, p.employeeCount != null && `Employees on LinkedIn: ${p.employeeCount}`, p.website && `Website: ${p.website}`].filter(Boolean).join("\n") + "\n");
    return { items: 1 };
  },

  async tiktok(slug, m, again, confirm) {
    if (had(slug, "tiktok/profile") && again !== "all") return { items: 1 };
    const handle = PROFILE.tiktok(m.url);
    const p = await vendor(SC, `/v1/tiktok/profile?handle=${encodeURIComponent(handle)}`);
    if (confirm(p, { website: p.user?.bioLink?.link })) return { held: true };
    save(slug, "tiktok/profile", p, [`# @${handle} on TikTok`, `url: https://www.tiktok.com/@${handle}`, p.user?.signature, p.stats?.followerCount != null && `Followers: ${p.stats.followerCount}`].filter(Boolean).join("\n") + "\n");
    return { items: 1 };
  },
};

/** Running ads: an ad library's answer names the ads active now, which is what retires an offer later. */
async function metaAds(slug, pageId, again) {
  if (had(slug, "ads/facebook") && !again) return { items: readJson(at("raw", slug, "ads", "facebook.json"))?.results?.length ?? 0 };
  const r = await vendor(SC, `/v1/facebook/adLibrary/company/ads?pageId=${encodeURIComponent(pageId)}&status=ACTIVE&country=US`);
  const list = r.results ?? [];
  save(slug, "ads/facebook", r, list.map((x) => `## Running since ${day(x.start_date)}\nurl: https://www.facebook.com/ads/library/?id=${x.ad_archive_id}\nlinks to: ${x.snapshot?.link_url ?? ""}\n\n${x.snapshot?.body?.text ?? ""}\n`).join("\n"));
  await pictures(slug, "ads/facebook", list.flatMap((x) => (x.snapshot?.images ?? []).map((i) => i.original_image_url ?? i.resized_image_url)));
  return { items: list.length };
}

async function googleAds(slug, domain, again) {
  if (had(slug, "ads/google") && !again) return { items: readJson(at("raw", slug, "ads", "google.json"))?.ads?.length ?? 0 };
  const r = await vendor(SC, `/v1/google/company/ads?domain=${encodeURIComponent(domain)}&region=US`);
  const list = r.ads ?? [];
  save(slug, "ads/google", r, list.map((x) => `## Shown ${x.firstShown?.slice(0, 10) ?? ""} to ${x.lastShown?.slice(0, 10) ?? ""}\nurl: ${x.adUrl}\n`).join("\n"));
  await pictures(slug, "ads/google", list.map((x) => x.imageUrl));
  return { items: list.length };
}

/** The company's Google listing, through tt-crawl: free of this file's plumbing, and it knows the gateway. */
function listing(row, slug, sources, again) {
  const out = at("raw", slug, "places");
  if (existsSync(out) && !again) return { items: 1 };
  const named = `${row.name}, ${cell(row, "locations")[0]?.city ?? ""}`;
  const query = row.website ? [named, "--site", row.website] : [named, "--first"];
  const env = { ...process.env };
  if (sources.places !== "key") {
    const m = machineEnv();
    env.GOOGLE_PLACES_API_URL = `${(m.PHOENIX_URL ?? "").replace(/\/+$/, "")}/api/machine/gateway/${sources.places}`;
    env.GOOGLE_PLACES_API_KEY = m.MACHINE_TOKEN;
  }
  const r = spawnSync("tt-crawl", ["places", ...query, "--out", out, "--json"], { encoding: "utf8", env, cwd: at() });
  if (r.status !== 0) return { none: (r.stderr || "").trim().split("\n")[0].slice(0, 200) };
  const summary = readdirSync(out).find((f) => f.endsWith(".summary.json"));
  const found = summary ? readJson(join(out, summary)) : null;
  if (!found) return { none: "tt-crawl wrote no listing" };
  // A search by name alone has to prove itself as a profile does.
  if (!row.website) {
    const phones = new Set(cell(row, "phones"));
    const phone = cleanPhone(found.telephone);
    if (!phone || !phones.has(phone)) return { held: `the listing found by name shows phone ${phone || "none"}; ${row.name} has ${[...phones].join(", ") || "none"}` };
  }
  return { items: 1, placeId: found.place_id };
}

/**
 * The company's Google rating and review count, from DataForSEO by name near its
 * first location: a task set once and collected when ready. Kept only when the
 * profile's website or phone is the company's, as a social profile is.
 */
async function googleProfile(row, slug, sources, state, again) {
  const name = "google/profile";
  if (had(slug, name) && !again) return { items: 1 };
  const place = cell(row, "locations")[0];
  if (!place?.lat) return { none: "no location to search near" };
  let taskId = state.profileTask;
  if (!taskId) {
    const made = await vendor(sources.dataforseo, "/v3/business_data/google/my_business_info/task_post", {
      method: "POST",
      body: JSON.stringify([{ keyword: `${row.name} ${place.city ?? ""}`.trim(), location_coordinate: `${place.lat},${place.lng},20000`, language_code: "en", priority: 2, tag: slug }]),
    });
    taskId = made.tasks?.[0]?.id;
    if (!taskId) return { none: made.tasks?.[0]?.status_message ?? "DataForSEO made no task" };
    state.profileTask = taskId;
  }
  const got = await vendor(sources.dataforseo, `/v3/business_data/google/my_business_info/task_get/${taskId}`);
  const task = got.tasks?.[0];
  if (!task?.result) {
    if (!task?.status_code || [40601, 40602, 20000].includes(task.status_code)) return { waiting: true };
    delete state.profileTask;
    return { none: task.status_message ?? `DataForSEO answered ${task.status_code}` };
  }
  delete state.profileTask;
  const p = task.result[0]?.items?.[0];
  if (!p) return { none: "Google has no listing by that name there" };
  const why = confirmedBy(row, siteCard(slug), { website: p.url ?? p.domain, phone: p.phone });
  if (!why) return { held: `the listing found, ${p.title}, shows ${p.domain || "no website"} and ${p.phone || "no phone"}` };
  const profile = { name: p.title, rating: p.rating?.value ?? null, count: p.rating?.votes_count ?? null, category: p.category ?? null, address: p.address ?? null, phone: p.phone ?? null, website: p.url ?? null, url: p.cid ? `https://maps.google.com/?cid=${p.cid}` : null, why };
  save(slug, name, profile, [`# ${profile.name} on Google`, profile.url && `url: ${profile.url}`, profile.rating != null && `Rating: ${profile.rating} from ${profile.count} reviews`, profile.category && `Category: ${profile.category}`, profile.address && `Address: ${profile.address}`, profile.phone && `Phone: ${profile.phone}`].filter(Boolean).join("\n") + "\n");
  return { items: 1 };
}

/** Every Google review, a task at DataForSEO: set once, collected on a later run if it is not ready yet. */
async function allReviews(slug, sources, placeId, state, again) {
  const name = "reviews/google";
  if (had(slug, name) && !again) return { items: readJson(at("raw", slug, "reviews", "google.json"))?.items?.length ?? 0 };
  if (!placeId) return { none: "no Google listing to read reviews from" };
  let taskId = state.reviewsTask;
  if (!taskId) {
    const made = await vendor(sources.dataforseo, "/v3/business_data/google/reviews/task_post", {
      method: "POST",
      body: JSON.stringify([{ place_id: placeId, location_name: "United States", language_code: "en", depth: REVIEW_DEPTH, sort_by: "newest", tag: slug }]),
    });
    taskId = made.tasks?.[0]?.id;
    if (!taskId) return { none: made.tasks?.[0]?.status_message ?? "DataForSEO made no task" };
    state.reviewsTask = taskId;
  }
  const got = await vendor(sources.dataforseo, `/v3/business_data/google/reviews/task_get/${taskId}`);
  const task = got.tasks?.[0];
  const result = task?.result?.[0];
  if (!result) {
    // In its queue (40601, 40602) it is worth asking again; any other answer means the task is dead.
    if (!task?.status_code || [40601, 40602, 20000].includes(task.status_code)) return { waiting: true };
    delete state.reviewsTask;
    return { none: task.status_message ?? `DataForSEO answered ${task.status_code}` };
  }
  const items = (result.items ?? []).map((x) => ({ rating: x.rating?.value, text: x.review_text ?? x.original_review_text ?? "", date: x.timestamp?.slice(0, 10) ?? "", author: x.profile_name ?? "", url: x.review_url ?? "" }));
  save(slug, name, { source: "google", rating: result.rating?.value, count: result.reviews_count, items }, items.map((x) => `## ${x.rating ?? "?"} stars, ${x.date}\nurl: ${x.url}\n\n${x.text}\n`).join("\n"));
  delete state.reviewsTask;
  return { items: items.length };
}

// ---- One company ----

/** A vendor out of credits, or refusing, stops for the day; what was fetched stays, and other sources carry on. */
const STOPPED = () => at(".pipeline", "stopped.json");
function stoppedSources(on) {
  const saved = readJson(STOPPED(), {});
  return Object.fromEntries(Object.entries(saved).filter(([, v]) => v.day === on));
}

/** What a source's own failure means: 402, 401, 403 or 429, or a refusal from Task & Tool, stops it. */
const stopsSource = (e) => e.refusal || [401, 402, 403, 429].includes(e.status);

export async function gatherCompany(row, sources, on, { again } = {}) {
  const slug = row.slug;
  const log = { fetched: on, sources: {}, ...readJson(at("raw", slug, "gather.json"), {}) };
  log.fetched = on;
  const stopped = stoppedSources(on);
  const notes = [];
  /** A source that may still answer: the company waits for it, since a read now would miss what it has. */
  let unfinished = false;

  /** One source, its outcome logged; any failure is only that source's. */
  const run = async (key, vendorName, fn) => {
    if (stopped[vendorName]) {
      log.sources[key] = { status: "skipped", why: stopped[vendorName].why, on };
      unfinished = true;
      return null;
    }
    try {
      const r = await fn();
      log.sources[key] = r.held ? { status: "held", why: typeof r.held === "string" ? r.held : "needs a person", on } : r.none ? { status: "none", why: r.none, on } : r.waiting ? { status: "waiting", on } : { status: "ok", items: r.items ?? 0, on };
      if (r.waiting) unfinished = true;
      return r;
    } catch (e) {
      log.sources[key] = { status: "failed", why: e.message.slice(0, 200), on };
      if (stopsSource(e)) {
        unfinished = true;
        const why = e.refusal ? `Task & Tool refused: ${e.refusal}` : `${vendorName} answered ${e.status}`;
        stopped[vendorName] = { day: on, why };
        writeJson(STOPPED(), stopped);
        notes.push(`stopped ${vendorName} for today: ${why}. Progress is kept.`);
      }
      return null;
    }
  };

  let placeId = readJson(at("raw", slug, "gather.json"))?.placeId;
  // A listing held for a person stays held until a refresh looks again.
  const heldListing = log.sources["google listing"]?.status === "held" && !again;
  if (sources.places && again !== "offers" && !heldListing) {
    const r = await run("google listing", "google-places", async () => listing(row, slug, sources, again));
    if (r?.placeId) placeId = log.placeId = r.placeId;
  }

  const matches = matchList(row, slug);
  if (sources.scrapecreators) {
    const card = siteCard(slug);
    for (const m of matches) {
      if (m.status === "held" || m.status === "rejected" || !fetchers[m.network]) continue;
      /** True when the profile fails to prove itself: held, and nothing from it is kept. */
      const confirm = (_raw, profile) => {
        settle(m, row, card, profile);
        return m.status === "held";
      };
      const r = await run(m.network, SC, () => fetchers[m.network](slug, m, again, confirm));
      if (m.network === "facebook" && r?.pageId) await run("facebook ads", SC, () => metaAds(slug, r.pageId, again));
    }
    if (row.domain) await run("google ads", SC, () => googleAds(slug, row.domain, again));
  }
  if (matches.length) writeJson(at("raw", slug, "matches.json"), matches);

  if (sources.dataforseo && again !== "offers") await run("google profile", "dataforseo", () => googleProfile(row, slug, sources, log, again));
  if (sources.dataforseo && placeId && again !== "offers") await run("google reviews", "dataforseo", () => allReviews(slug, sources, placeId, log, again));

  writeJson(at("raw", slug, "gather.json"), log);
  const said = Object.entries(log.sources).filter(([, v]) => v.status === "ok").map(([k, v]) => `${k} ${v.items}`);
  const heldNow = matches.filter((m) => m.status === "held").map((m) => m.network);
  return {
    unfinished,
    line: [`${row.name}: ${said.join(", ") || "nothing beyond its site"}${heldNow.length ? `; held for a person: ${heldNow.join(", ")}` : ""}`, ...notes].join("\n"),
  };
}

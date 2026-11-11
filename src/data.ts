// What scripts/build-data.mjs wrote to data/, for the pages. Machine only: the
// pages are pre-rendered here, and the Worker never reaches this file.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(process.env.SITE_ROOT || join(fileURLToPath(import.meta.url), "..", ".."));

export type Evidence = { quote: string; url: string; where: string; corrected?: string | null };
export type Guarantee = Evidence & { kind: string; promise: string | null; length: string | null; covers: string | null; conditions: string | null; whose: string | null };
export type Offer = Evidence & { kind: string; title: string; ends: string | null; conditions: string | null; source: string; firstSeen: string; lastSeen: string };
export type Service = Evidence & { name: string; price: string | null };
export type Rating = { platform: string; rating: number; count: number | null; url: string; where: string };
export type Location = { address: string; city: string; region: string; postcode: string; lat: number | null; lng: number | null; areas: string[] };
export type ReviewCard = { quote: string; who: string | null; stars: number | null; day: string | null; where: string; url: string };
export type Company = {
  slug: string;
  name: string;
  pitch: (Evidence & { headline: string; points: (Evidence & { text: string })[] }) | null;
  reviewCards: ReviewCard[];
  leadTo: string | null;
  termsUrl: string | null;
  path: string;
  website: string;
  domain: string;
  scope: string;
  crawled: string;
  fetched: string;
  note: string | null;
  siteDown: boolean;
  leftSource: string | null;
  phones: { value: string; where: string[] }[];
  emails: { value: string; where: string[] }[];
  hours: { text: string[]; where: string }[];
  booking: string;
  logo: string | null;
  photos: { src: string; kind: string; alt: string; source: string; credit: string | null; creditUrl: string | null }[];
  social: string[];
  ratings: Rating[];
  locations: Location[];
  serves: { name: string; area: string | null }[];
  servesQuotes: Evidence[];
  background: { summary: string | null; founded: number | null; people: { name: string; role?: string }[]; evidence: Evidence[] } | null;
  services: Service[];
  guarantees: Guarantee[];
  offers: Offer[];
  brands: (Evidence & { name: string })[];
  proof: (Evidence & { kind: string; title: string })[];
  details: (Evidence & { name: string; value: string | null })[];
  keywords: string[];
  testimonials: (Evidence & { who: string | null })[];
  reviews: { praise: Theme[]; complaints: Theme[]; services: Theme[]; read: number } | null;
  index: boolean;
  firstSeen: string;
};
export type Theme = { theme: string; quote?: string; source?: string; count: number | null; of: number };
export type PageFlag = { path: string; kind: string; index: boolean; ready: boolean; why?: string };

const read = <T,>(name: string, fallback: T): T => {
  const file = join(ROOT, "data", `${name}.json`);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
};

export type Data = {
  ready: boolean;
  companies: Company[];
  stats: { total: number; built: string; withOffer: number; withRating: number; withPhotos: number; withWebsite: number };
  pages: PageFlag[];
};

let cached: { at: number; data: Data } | null = null;

/** Read again whenever the build has run, so dev shows a rebuild on refresh. */
export function loadData(): Data {
  const stamp = join(ROOT, "data", "stats.json");
  const at = existsSync(stamp) ? statSync(stamp).mtimeMs : 0;
  if (cached?.at === at) return cached.data;
  const data: Data = {
    ready: at > 0,
    companies: read("companies", []),
    stats: read("stats", { total: 0, built: "", withOffer: 0, withRating: 0, withPhotos: 0, withWebsite: 0 }),
    pages: read("pages", []),
  };
  cached = { at, data };
  return data;
}

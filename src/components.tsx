// The parts the company page is built from. Source text is only ever rendered as text (JSX
// escapes it), and build-data has already emptied any link that is not web, mail or phone.
import type { Child } from "hono/jsx";
import type { Evidence, Offer, Rating, ReviewCard as Review } from "./data";
export { mergeGuarantees, type GuaranteeGroup } from "./guarantees";
export const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const day = (s?: string | null) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");

export function Tag({ children, href }: { children?: Child; href?: string }) {
  const cls = "inline-block rounded-full border border-line bg-surface px-3 py-1 no-underline";
  return href ? <a href={href} class={`${cls} hover:border-line-strong`}>{children}</a> : <span class={cls}>{children}</span>;
}

// ---- The storefront's parts ----

/** A length as a word before a noun: "10 years" becomes "10-year", and "1 year parts guarantee" reads right. */
export const lengthWord = (s: string) => s.replace(/^([\d–-]+)[ -]?years?$/i, "$1-year").replace(/^([\d–-]+)[ -]?months?$/i, "$1-month");

export const CTA = "inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-accent px-6 font-semibold text-accent-ink no-underline shadow-card transition-colors duration-150 ease-soft hover:bg-accent-hover";
export const CTA_QUIET = "inline-flex min-h-12 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-5 font-semibold text-ink no-underline transition-colors duration-150 ease-soft hover:bg-panel";

/** The signature: beside anything a company states. */
export const Check = ({ class: cls = "" }: { class?: string }) => (
  <span class={`inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink ${cls}`} aria-hidden="true">
    <svg viewBox="0 0 20 20" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 10.5 3.2 3.2L15 6.800" /></svg>
  </span>
);
export const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.900v3a2 2 0 0 1-2.200 2 19.800 19.800 0 0 1-8.600-3.100 19.500 19.500 0 0 1-6-6A19.800 19.800 0 0 1 2.100 4.200 2 2 0 0 1 4.100 2h3a2 2 0 0 1 2 1.700c.1 1 .4 1.900.7 2.800a2 2 0 0 1-.5 2.100L8.100 9.900a16 16 0 0 0 6 6l1.300-1.300a2 2 0 0 1 2.100-.4c.9.3 1.800.5 2.800.7a2 2 0 0 1 1.700 2z" /></svg>
);
const STAR = "M10 1.700l2.500 5.200 5.700.8-4.100 4 1 5.700L10 14.700l-5.100 2.700 1-5.700-4.100-4 5.700-.8z";
const StarRow = () => <>{[0, 1, 2, 3, 4].map(() => <svg viewBox="0 0 20 20" class="size-4 shrink-0 fill-current" aria-hidden="true"><path d={STAR} /></svg>)}</>;
/** A platform's own number, drawn. Never ours, and never shown without one behind it. */
export const Stars = ({ rating }: { rating: number }) => (
  <span class="relative inline-flex align-middle text-line-strong" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
    <StarRow />
    <span class="absolute inset-y-0 left-0 inline-flex overflow-hidden text-star" style={`width:${Math.max(0, Math.min(100, (rating / 5) * 100))}%`}><StarRow /></span>
  </span>
);
export const GoogleMark = () => <img src="/google.svg" alt="" width="16" height="16" class="size-4 shrink-0" />;

/** The first platform's rating: stars, the number, how many. */
export function RatingBadge({ ratings, class: cls = "" }: { ratings: Rating[]; class?: string }) {
  const r = ratings[0];
  if (!r) return null;
  const google = r.platform === "Google";
  return (
    <span class={`inline-flex flex-wrap items-center gap-x-1.5 ${cls}`}>
      {google ? <GoogleMark /> : null}
      <Stars rating={r.rating} />
      <strong class="font-semibold">{r.rating.toFixed(1)}</strong>
      {r.count != null ? <span class="opacity-75">({r.url ? <a href={r.url} rel="nofollow noopener" class="relative z-10 no-underline hover:underline">{r.count.toLocaleString("en-US")}{google ? " Google reviews" : ""}</a> : <>{r.count.toLocaleString("en-US")}{google ? " Google reviews" : ""}</>})</span> : null}
      {!google ? <span class="opacity-75">on their site</span> : null}
    </span>
  );
}

/** Where a card's fine print lives: the company's own page. Only where the record holds conditions. */
export const TermsApply = ({ item, has }: { item: Evidence; has?: string | null }) =>
  has && item.url ? <p class="mt-auto pt-3 text-label text-ink-3"><a href={item.url} rel="nofollow noopener" class="relative z-10 underline hover:text-ink">Terms apply</a></p> : null;

/** One offer, one glance: what you get, and by when. */
export function OfferCard({ o }: { o: Offer }) {
  return (
    <article data-ends={o.ends ?? undefined} class="relative flex flex-col rounded-card border border-line bg-surface p-5 shadow-card">
      {o.ends ? <p class="mb-2.5"><span class="rounded-full bg-mark-soft px-2.5 py-1 text-label font-semibold text-mark">Ends {day(o.ends)}</span></p> : null}
      <h3 class="font-display text-[1.5rem] leading-[1.15]">{o.title}</h3>
      <TermsApply item={o} has={o.conditions} />
    </article>
  );
}

/** A customer's words. Stars only where the platform gave them. */
export function ReviewCard({ r, copy }: { r: Review; copy?: boolean }) {
  return (
    <figure class="flex w-80 shrink-0 flex-col rounded-card bg-surface p-5 text-ink shadow-card">
      <div class="flex items-center justify-between gap-3">
        <p class="flex min-w-0 items-center gap-2">
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent" aria-hidden="true">{(r.who ?? "?").charAt(0).toUpperCase()}</span>
          <span class="truncate font-semibold">{r.url && !copy ? <a href={r.url} rel="nofollow noopener" class="no-underline hover:underline">{r.who ?? "A customer"}</a> : r.who ?? "A customer"}</span>
        </p>
        {r.where === "Google" ? <GoogleMark /> : null}
      </div>
      {r.stars ? <p class="mt-2"><Stars rating={r.stars} /></p> : null}
      <blockquote class="mt-2 line-clamp-5">{r.quote}</blockquote>
      <figcaption class="mt-auto pt-2 text-label text-ink-3">{r.where === "Google" ? `On Google${r.day ? `, ${day(r.day)}` : ""}` : "From their website"}</figcaption>
    </figure>
  );
}

/** Two rows of reviews drifting past, or still ones when there are few or a reader asks for less motion. */
export function ReviewMarquee({ reviews }: { reviews: Review[] }) {
  if (reviews.length < 4) return <div class="mx-auto flex max-w-wide flex-wrap justify-center gap-4 px-5 sm:px-8">{reviews.map((r) => <ReviewCard r={r} />)}</div>;
  const half = Math.ceil(reviews.length / 2);
  const rows = [reviews.slice(0, half), reviews.slice(half)].filter((x) => x.length);
  return (
    <div class="space-y-4">
      {rows.map((row, i) => {
        // Enough copies to outrun a wide screen, and exactly two equal halves so the loop has no seam.
        const half2 = Array.from({ length: Math.max(1, Math.ceil(6 / row.length)) }).flatMap(() => row);
        return (
          <div class="overflow-hidden motion-reduce:overflow-x-auto">
            <div class={`flex w-max gap-4 animate-[marquee_80s_linear_infinite] hover:[animation-play-state:paused] motion-reduce:animate-none ${i ? "[animation-direction:reverse]" : ""}`}>
              {half2.map((r) => <ReviewCard r={r} />)}
              {half2.map((r) => <div aria-hidden="true" class="motion-reduce:hidden"><ReviewCard r={r} copy /></div>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

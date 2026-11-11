// One company's whole site on one page, top to bottom: a plain promise and a real photo,
// proof from customers, what is on offer, what is guaranteed, who does the work, then the
// request. Every line comes from its record, and a section with nothing to say is left out.
import type { Company } from "../data";
import { CTA, CTA_QUIET, Check, GoogleMark, type GuaranteeGroup, OfferCard, mergeGuarantees, PhoneIcon, RatingBadge, ReviewCard, ReviewMarquee, Stars, Tag, TermsApply, day, lengthWord, title } from "../components";
import { SpamFields } from "../data/spam";
import { Band, site, type Page } from "../shell";

const NETWORK_NAMES: [RegExp, string][] = [[/facebook/, "Facebook"], [/instagram/, "Instagram"], [/linkedin/, "LinkedIn"], [/tiktok/, "TikTok"], [/youtube/, "YouTube"], [/yelp/, "Yelp"], [/^(twitter|x)\./, "X"]];
const networkName = (u: string) => {
  const host = new URL(u).hostname.replace(/^www\./, "");
  return NETWORK_NAMES.find(([re]) => re.test(host))?.[1] ?? host;
};
/** How many cards stand open: all of them, unless folding away saves more than a row. */
const shown = (n: number) => (n > 9 ? 6 : n);
const firstNameIn = (alt: string, name: string) => alt.toLowerCase().includes(name.split(" ")[0].toLowerCase());

const guaranteeName = (g: { kind: string; covers: string | null }) => (g.kind === "other" ? title(g.covers ?? "Their promise") : `${title(g.kind)} guarantee`);
const telOf = (s: string) => `tel:${s.replace(/\D/g, "")}`;

export function companyPage(c: Company): Page {
  const where = c.locations[0]?.city;
  // No offer here: a description can't be taken down in the browser once the offer ends.
  const best = c.pitch?.headline ?? (c.guarantees[0] ? guaranteeName(c.guarantees[0]) : "");
  return {
    path: c.path,
    title: where ? `${c.name} in ${where}` : c.name,
    description: `${c.name}${where ? ` in ${where}` : ""}${best ? `: ${best}` : ""}. Its offers, guarantees, reviews and work.`,
    index: false,
    company: c.name,
  };
}

/** The page's one action: the quote form (requests are saved, and reach us until the company says yes). */
function actionOf(c: Company) {
  const free = c.offers.some((o) => /free/i.test(o.kind));
  return { href: "#request", label: free ? "Get your free estimate" : "Request a quote" };
}

/** Who took a Google photo: small and under it, with the link on their name. */
const PhotoCredit = ({ photo, end }: { photo: Company["photos"][number]; end?: boolean }) =>
  photo.credit ? (
    <figcaption class={`mt-1 truncate text-[0.75rem] text-ink-3 ${end ? "pl-36 text-right" : ""}`}>
      {photo.creditUrl ? <a href={photo.creditUrl} rel="nofollow noopener" class="no-underline hover:underline">{photo.credit}</a> : photo.credit}
    </figcaption>
  ) : null;

const WITH_PEOPLE = /\b(technicians?|workers?|installers?|crew|team|staff|employees?|owners?|people|person|man|men|woman|women|family|customers?)\b/i;

/** Fine in a gallery, poor as the first thing a visitor sees. */
const CLOSE_UP = /\b(close|closeup|wiring|wires?|control board|panel|gauge|thermostat|capacitor|exposed)\b/i;

/** Each picture is used once: the hero's, then the one beside the people, then the gallery has the rest. */
function picturesOf(c: Company) {
  const lead = c.background?.people[0]?.name ?? "";
  const team = c.photos.filter((p) => p.kind === "team");
  const named = lead ? team.find((p) => firstNameIn(p.alt, lead)) : undefined;
  const candidates = c.photos.filter((p) => p !== named);
  // People first: a face sells better than a unit, and the saved description says who is in the picture.
  const hero = team.find((p) => p !== named) ?? candidates.find((p) => WITH_PEOPLE.test(p.alt)) ?? candidates.find((p) => (p.kind === "work" || p.kind === "before_after") && !CLOSE_UP.test(p.alt)) ?? candidates.find((p) => p.kind === "work" || p.kind === "before_after") ?? named ?? c.photos[0];
  const people = named ?? c.photos.find((p) => p !== hero && (p.kind === "team" || p.kind === "premises"));
  return { hero, people, named, rest: c.photos.filter((p) => p !== hero && p !== people) };
}

function SectionHead({ id, heading, lede }: { id?: string; heading: string; lede?: string }) {
  return (
    <div class="mx-auto max-w-3xl text-center">
      <h2 id={id} class="font-display text-section">{heading}</h2>
      {lede ? <p class="mt-3 text-lede text-ink-2">{lede}</p> : null}
    </div>
  );
}

function Hero({ c, action }: { c: Company; action: ReturnType<typeof actionOf> }) {
  const photo = picturesOf(c).hero;
  const offer = c.offers.find((o) => o.ends) ?? c.offers[0];
  const seal = c.guarantees.find((g) => g.length && g.length.length <= 18 && g.kind !== "other");
  const served = c.serves.filter((s) => s.name).slice(0, 4).map((s) => s.name);
  const eyebrow = served.length ? `Serving ${served.join(", ")}` : c.locations[0]?.city ? `In ${c.locations[0].city}` : "";
  // An offer among the points carries its end date, so site.js takes it down on a page built before then.
  const points: { text: string; ends?: string | null }[] = c.pitch?.points.length
    ? c.pitch.points.map((p) => ({ text: p.text }))
    : [...c.offers.slice(0, 2).map((o) => ({ text: o.title, ends: o.ends })), ...c.guarantees.filter((g) => g.kind !== "other").slice(0, 2).map((g) => ({ text: guaranteeName(g) }))];
  const tel = c.phones[0]?.value;
  return (
    <Band class="pt-8 pb-12 sm:pt-12 lg:pb-16">
      <div class="grid items-center gap-10 lg:grid-cols-[1.08fr_1fr] lg:gap-14">
        <div>
          <div class="flex items-center gap-3">
            {c.logo ? <img src={c.logo} alt="" class="h-12 w-auto max-w-32 object-contain" /> : null}
            <div>
              <p class="font-semibold">{c.name}</p>
              {eyebrow ? <p class="text-label text-ink-3">{eyebrow}</p> : null}
            </div>
          </div>
          <h1 class="mt-5 font-display text-display">{c.pitch?.headline ?? c.name}</h1>
          {!c.pitch && c.background?.summary ? <p class="mt-4 max-w-xl text-lede text-ink-2">{c.background.summary}</p> : null}
          {points.length ? (
            <ul class="mt-6 grid gap-2.5 sm:grid-cols-2">
              {points.slice(0, 6).map((p) => <li data-ends={p.ends ?? undefined} class="flex items-start gap-2.5 font-medium"><Check class="mt-0.5" /><span>{p.text}</span></li>)}
            </ul>
          ) : null}
          {offer ? (
            <p data-ends={offer.ends ?? undefined} class="mt-7 inline-flex -rotate-1 flex-wrap items-baseline gap-x-3 rounded-control bg-highlight px-4 py-2.5 text-highlight-ink">
              <strong class="font-display text-title">{offer.title}</strong>
              {offer.ends ? <span class="font-semibold">Ends {day(offer.ends)}</span> : null}
            </p>
          ) : null}
          <div class="mt-6 flex flex-wrap items-center gap-3">
            {action ? <a href={action.href} class={CTA}>{action.label}</a> : null}
            {tel && action?.href === "#request" ? <a href={telOf(tel)} class={CTA_QUIET}><PhoneIcon /> {tel}</a> : null}
          </div>
          {c.ratings.length ? <p class="mt-4 text-ink-2"><RatingBadge ratings={c.ratings} /></p> : null}
        </div>
        {photo ? (
          <div class="relative">
            <figure>
              <img src={photo.src} alt={photo.alt} class="aspect-[5/4] w-full rounded-card object-cover shadow-lift" />
              <PhotoCredit photo={photo} end={Boolean(seal)} />
            </figure>
            {seal ? (
              <p class={`absolute left-5 flex size-32 ${photo.credit ? "bottom-1" : "-bottom-6"} flex-col items-center justify-center rounded-full bg-night p-3 text-center text-night-ink shadow-lift`}>
                <Check />
                <span class="mt-1.5 text-label leading-tight font-semibold">{title(lengthWord(seal.length as string))} {seal.kind} guarantee</span>
              </p>
            ) : null}
          </div>
        ) : c.offers[0] ? (
          <div class="rounded-card bg-mark-soft p-8" data-ends={c.offers[0].ends ?? undefined}>
            <p class="font-semibold text-mark">{c.offers[0].ends ? `Ends ${day(c.offers[0].ends)}` : "On offer now"}</p>
            <p class="mt-2 font-display text-section">{c.offers[0].title}</p>
            {c.reviewCards[0] ? <blockquote class="mt-5 border-t border-line pt-4 text-ink-2">“{c.reviewCards[0].quote.slice(0, 180)}{c.reviewCards[0].quote.length > 180 ? "..." : ""}”</blockquote> : null}
          </div>
        ) : c.reviewCards[0] ? (
          <div class="flex justify-center lg:justify-end [&>figure]:w-full [&>figure]:max-w-md"><ReviewCard r={c.reviewCards.find((r) => r.stars === 5) ?? c.reviewCards[0]} /></div>
        ) : null}
      </div>
    </Band>
  );
}

function ReviewsBand({ c }: { c: Company }) {
  if (!c.reviewCards.length && !c.ratings.length) return null;
  const r = c.ratings[0];
  // The band sells: the good ones drift past, it says so, and any complaint is listed further down.
  const good = c.reviewCards.filter((x) => x.stars == null || x.stars >= 4);
  const held = c.reviewCards.length - good.length;
  return (
    <section aria-labelledby="reviews" class="bg-night py-section text-night-ink">
      <div class="mx-auto max-w-wide px-5 text-center sm:px-8">
        <h2 id="reviews" class="font-display text-section">{r?.count != null && r.platform === "Google" ? `Rated ${r.rating.toFixed(1)} from ${r.count.toLocaleString("en-US")} Google reviews` : "What customers say"}</h2>
        {r ? <p class="mt-3 flex items-center justify-center gap-2"><Stars rating={r.rating} />{r.platform === "Google" ? <GoogleMark /> : <span>{r.rating.toFixed(1)} on their site</span>}</p> : null}
      </div>
      {good.length ? <div class="mt-8"><ReviewMarquee reviews={good} /></div> : null}
      {held ? <p class="mt-6 px-5 text-center text-label text-night-ink-2">Showing 4 and 5 star reviews. {r?.url ? <a href={r.url} rel="nofollow noopener" class="underline">Read all of them on {r.platform}</a> : null}</p> : null}
    </section>
  );
}

function Offers({ c }: { c: Company }) {
  if (!c.offers.length) return null;
  return (
    <section aria-labelledby="offers" class="py-section">
      <Band>
        <SectionHead id="offers" heading="Current offers" />
        <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{c.offers.slice(0, shown(c.offers.length)).map((o) => <OfferCard o={o} />)}</div>
        {c.offers.length > shown(c.offers.length) ? (
          <details class="mt-4">
            <summary class="mx-auto w-fit cursor-pointer select-none rounded-control px-4 py-2 font-semibold text-accent hover:bg-panel">See all {c.offers.length} offers</summary>
            <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{c.offers.slice(shown(c.offers.length)).map((o) => <OfferCard o={o} />)}</div>
          </details>
        ) : null}
      </Band>
    </section>
  );
}

function GuaranteeCard({ g }: { g: GuaranteeGroup }) {
  return (
    <article class="flex flex-col rounded-card bg-surface p-5 shadow-card">
      <p class="flex items-start gap-2.5"><Check class="mt-0.5" /><span class="font-body text-title">{g.name}</span></p>
      {g.length ? <p class="mt-2.5 font-display text-[1.625rem] leading-tight">{title(g.length)}</p> : null}
      {g.lines.length === 1 ? <p class="mt-1.5 text-ink-2">{g.lines[0]}</p> : null}
      {g.lines.length > 1 ? <ul class="mt-2 list-disc space-y-1 pl-5 text-ink-2">{g.lines.map((l) => <li>{l}</li>)}</ul> : null}
      {g.terms ? <TermsApply item={g.terms} has="yes" /> : null}
    </article>
  );
}

function Guarantees({ c }: { c: Company }) {
  if (!c.guarantees.length) return null;
  const groups = mergeGuarantees(c.guarantees);
  return (
    <section aria-labelledby="guarantees" class="bg-panel py-section">
      <Band>
        <SectionHead id="guarantees" heading="Guarantees" />
        <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{groups.map((g) => <GuaranteeCard g={g} />)}</div>
      </Band>
    </section>
  );
}

function Services({ c, action }: { c: Company; action: ReturnType<typeof actionOf> }) {
  const named = c.services.filter((s) => s.name !== "other");
  if (!named.length) return null;
  const seen = new Set<string>();
  const once = named.filter((s) => !seen.has(s.name) && seen.add(s.name));
  return (
    <section aria-labelledby="services" class="py-section">
      <Band>
        <SectionHead id="services" heading="Services" />
        <ul class="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {once.map((s) => (
            <li class="flex items-start gap-2.5 rounded-control border border-line bg-surface p-3.5">
              <Check class="mt-0.5" />
              <span>
                <span class="font-medium">{title(s.name)}</span>
                {s.price ? <span class="block text-label text-ink-2">{s.price}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {action ? <p class="mt-8 text-center"><a href={action.href} class={CTA}>{action.label}</a></p> : null}
      </Band>
    </section>
  );
}

function Work({ c }: { c: Company }) {
  const all = picturesOf(c).rest;
  // One picture alone isn't a gallery, and beside the others it reads as a repeat.
  if (all.length < 2) return null;
  // Layouts that always fill their frame: five is one large and four small, three a row, otherwise even tiles.
  const list = all.length === 7 ? all.slice(0, 6) : all.slice(0, 8);
  const n = list.length;
  const big = n === 5;
  return (
    <section aria-labelledby="work" class="bg-panel py-section">
      <Band>
        <SectionHead id="work" heading={all.some((p) => p.kind === "work" || p.kind === "before_after") ? "Their work" : "Photos"} />
        <div class={`mt-8 grid gap-3 sm:gap-4 ${n === 1 ? "mx-auto max-w-3xl" : n === 2 || n === 4 ? "grid-cols-2" : n === 3 || n === 6 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-4"}`}>
          {list.map((p, i) => (
            <figure class={big && i === 0 ? "col-span-2 row-span-2" : n === 3 && i === 2 ? "col-span-2 lg:col-span-1" : ""}>
              <img src={p.src} alt={p.alt} loading="lazy" class={`w-full rounded-card object-cover ${p.credit ? "" : "h-full "}${n <= 2 ? "aspect-[3/2]" : n === 3 && i === 2 ? "aspect-[2/1] lg:aspect-square" : "aspect-square"}`} />
              <PhotoCredit photo={p} />
            </figure>
          ))}
        </div>
      </Band>
    </section>
  );
}

function People({ c, action }: { c: Company; action: ReturnType<typeof actionOf> }) {
  const { people: photo, named: pictured } = picturesOf(c);
  const people = c.background?.people ?? [];
  const facts = [
    ...(c.background?.founded ? [`In business since ${c.background.founded}`] : []),
    ...c.proof.filter((p) => p.kind === "license" || p.kind === "certification" || p.kind === "accreditation" || p.kind === "dealer status").slice(0, 5).map((p) => p.title),
    ...c.proof.filter((p) => p.kind === "award").slice(0, 3).map((p) => p.title),
  ];
  if (!photo && !people.length && !facts.length && !c.background?.summary) return null;
  const lead = people[0];
  return (
    <section aria-labelledby="people" class="py-section">
      <Band>
        <div class={`grid items-center gap-10 ${photo ? "lg:grid-cols-2 lg:gap-14" : "mx-auto max-w-3xl"}`}>
          {photo ? (
            <figure>
              <img src={photo.src} alt={photo.alt} loading="lazy" class="aspect-[5/4] w-full rounded-card object-cover shadow-lift" />
              {photo.credit ? <PhotoCredit photo={photo} /> : pictured ? null : <figcaption class="mt-3 text-label text-ink-3">{photo.alt}</figcaption>}
            </figure>
          ) : null}
          <div>
            {lead ? <p class="text-label font-semibold text-accent">{lead.role ? `Meet the ${lead.role}` : "Meet them"}</p> : null}
            <h2 id="people" class="mt-1 font-display text-section">{lead ? lead.name : `About ${c.name}`}</h2>
            {c.background?.summary ? <p class="mt-3 text-lede text-ink-2">{c.background.summary}</p> : null}
            {people.length > 1 ? <p class="mt-2 text-ink-2">With {people.slice(1, 5).map((p) => (p.role ? `${p.name}, ${p.role}` : p.name)).join("; ")}.</p> : null}
            {facts.length ? <ul class="mt-5 space-y-2">{facts.map((f) => <li class="flex items-start gap-2.5"><Check class="mt-0.5" /><span>{f}</span></li>)}</ul> : null}
            {c.brands.length ? <p class="mt-5 flex flex-wrap gap-2">{[...new Set(c.brands.map((b) => b.name))].map((b) => <Tag>{b}</Tag>)}</p> : null}
            {action ? <p class="mt-6"><a href={action.href} class={CTA}>{action.label}</a></p> : null}
          </div>
        </div>
      </Band>
    </section>
  );
}

/** The notice, wherever a reader is about to act on an offer or a guarantee. */
function TermsNotice({ c, class: cls = "" }: { c: Company; class?: string }) {
  if (!c.offers.length && !c.guarantees.length) return null;
  const to = c.termsUrl ?? c.website;
  return (
    <p class={cls}>
      Offers and guarantees are subject to {c.name}'s terms.{to ? <> <a href={to} rel="nofollow noopener" class="underline">Read their terms</a>.</> : null}
    </p>
  );
}

function RequestBand({ c }: { c: Company }) {
  const input = "mt-1 min-h-12 w-full rounded-control border border-line-strong bg-surface px-3 font-normal text-ink";
  const quote = c.reviewCards.find((r) => r.stars === 5 && r.quote.length < 240) ?? c.reviewCards.find((r) => r.quote.length < 240);
  const free = c.offers.some((o) => /free/i.test(o.kind));
  const reasons = c.pitch?.points.slice(0, 3).map((p) => p.text) ?? [];
  return (
    <section id="request" aria-labelledby="request-heading" class="scroll-mt-14 bg-night py-section text-night-ink">
      <div class="mx-auto grid max-w-wide gap-x-16 gap-y-8 px-5 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:grid-rows-[auto_1fr]">
        <div>
          <h2 id="request-heading" class="font-display text-section">{free ? `Get your free estimate from ${c.name}` : `Ask ${c.name} for a quote`}</h2>
          <p class="mt-3 text-lede text-night-ink-2">It takes a minute, and they reply to you directly.</p>
        </div>
        <form method="post" action={`/request/${c.slug}`} data-lead-form class="rounded-card bg-surface p-6 text-ink shadow-lift sm:p-8 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <SpamFields stamp="" />
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="text-label font-semibold">Your name<input name="name" required autocomplete="name" class={input} /></label>
            <label class="text-label font-semibold">Phone<input name="phone" type="tel" required autocomplete="tel" class={input} /></label>
            <label class="text-label font-semibold">Email <span class="font-normal text-ink-3">(optional)</span><input name="email" type="email" autocomplete="email" class={input} /></label>
            <label class="text-label font-semibold">ZIP code <span class="font-normal text-ink-3">(optional)</span><input name="zip" inputmode="numeric" maxlength={5} autocomplete="postal-code" class={input} /></label>
            <label class="text-label font-semibold sm:col-span-2">What do you need?<textarea name="need" required rows={3} class={`${input} py-2`} /></label>
          </div>
          <button class={`${CTA} mt-5 w-full`}>{free ? "Get my free estimate" : "Send my request"}</button>
          <p class="mt-3 text-label text-ink-3">Your request goes to {c.name} only, passed on by {site.name}, who made this page.</p>
          <TermsNotice c={c} class="mt-1 text-label text-ink-3" />
          <noscript><p class="mt-3 text-label text-mark">This form needs JavaScript. Please call them instead.</p></noscript>
        </form>
        {reasons.length || quote ? (
          <div class="lg:col-start-1 lg:row-start-2">
            {reasons.length ? <ul class="space-y-2.5">{reasons.map((p) => <li class="flex items-start gap-2.5"><Check class="mt-0.5" /><span>{p}</span></li>)}</ul> : null}
            {quote ? (
              <figure class="mt-8 border-t border-line-on-night pt-6">
                {quote.stars ? <Stars rating={quote.stars} /> : null}
                <blockquote class="mt-2 font-display text-[1.375rem] leading-snug">“{quote.quote}”</blockquote>
                {quote.who ? <figcaption class="mt-2 text-night-ink-2">{quote.who}{quote.where === "Google" ? ", on Google" : ""}</figcaption> : null}
              </figure>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ReviewThemes({ c }: { c: Company }) {
  if (!c.reviews || (!c.reviews.praise.length && !c.reviews.complaints.length)) return null;
  const all = c.ratings.find((r) => r.platform === "Google");
  const Col = ({ label, list }: { label: string; list: typeof c.reviews.praise }) => list.length ? (
    <div>
      <h3 class="font-body text-title">{label}</h3>
      <ul class="mt-3 space-y-3">
        {list.slice(0, 4).map((t) => (
          <li>
            <strong class="font-semibold">{title(t.theme)}</strong>
            {t.quote ? <blockquote class="text-ink-2">“{t.quote}”</blockquote> : null}
          </li>
        ))}
      </ul>
    </div>
  ) : null;
  return (
    <section aria-labelledby="themes" class="py-section">
      <Band>
        <SectionHead id="themes" heading="What customers mention" />
        <div class={`mx-auto mt-8 grid max-w-4xl gap-8 ${c.reviews.praise.length && c.reviews.complaints.length ? "md:grid-cols-2" : "max-w-xl"}`}><Col label="What they like" list={c.reviews.praise} /><Col label="What some raise" list={c.reviews.complaints} /></div>
        {all?.url ? <p class="mt-8 text-center"><a href={all.url} rel="nofollow noopener" class="font-semibold">Read all {all.count != null ? `${all.count.toLocaleString("en-US")} ` : ""}reviews on {all.platform}</a></p> : null}
      </Band>
    </section>
  );
}

function Where({ c }: { c: Company }) {
  const named = c.serves.filter((s) => s.name);
  const hours = c.hours[0];
  if (!named.length && !c.locations.length && !hours && !c.phones.length) return null;
  return (
    <section aria-labelledby="where" class="bg-panel py-section">
      <Band>
        <SectionHead id="where" heading="Service area" />
        <div class="mx-auto mt-8 grid max-w-2xl gap-8">
          <div class="space-y-6">
            {named.length ? <div><h3 class="font-body text-title">Areas served</h3><p class="mt-2 flex flex-wrap gap-1.5">{named.map((s) => <Tag>{s.name}</Tag>)}</p></div> : null}
            {c.locations.length ? <div><h3 class="font-body text-title">Address</h3><ul class="mt-2 space-y-1 text-ink-2">{c.locations.map((l) => <li>{[l.address, l.city, l.region, l.postcode].filter(Boolean).join(", ")}</li>)}</ul></div> : null}
            {hours ? <div><h3 class="font-body text-title">Hours</h3><ul class="mt-2 text-ink-2">{hours.text.map((t) => <li>{t}</li>)}</ul></div> : null}
            <div>
              <h3 class="font-body text-title">Contact</h3>
              <ul class="mt-2 space-y-1">
                {c.phones.slice(0, 2).map((p) => <li><a href={telOf(p.value)}>{p.value}</a></li>)}
                {c.website ? <li><a href={c.website} rel="nofollow noopener">{c.domain}</a></li> : null}
              </ul>
              {c.social.length ? <p class="mt-2 flex flex-wrap gap-x-3">{c.social.map((u) => <a href={u} rel="nofollow noopener">{networkName(u)}</a>)}</p> : null}
            </div>
          </div>
        </div>
      </Band>
    </section>
  );
}

/** Every page this one drew on, in one place at the end, so the sales page above stays a sales page. */
function Sources({ c }: { c: Company }) {
  const all = [c.pitch, ...(c.pitch?.points ?? []), ...c.offers, ...c.guarantees, ...c.services, ...c.brands, ...c.proof, ...c.details, ...c.testimonials, ...(c.background?.evidence ?? [])];
  const urls = [...new Set(all.map((x) => x?.url).filter((u): u is string => Boolean(u)))];
  return (
    <Band>
      <TermsNotice c={c} class="mx-auto max-w-3xl border-t border-line pt-5 text-label text-ink-3" />
      <p class="mx-auto mt-2 max-w-3xl text-label text-ink-3">
        Is this your business? We built this page from your website and reviews. Use it as your site, or let it bring you leads.{" "}
        {site.agencyUrl ? <a href={site.agencyUrl} class="font-semibold text-accent underline">See how it works</a> : null}
      </p>
      <details class="mx-auto mt-2 max-w-3xl text-label text-ink-3">
        <summary class="cursor-pointer select-none hover:text-ink">Where this comes from</summary>
        <p class="mt-2 font-normal">From {c.name}'s website and public reviews{c.crawled ? `, read ${day(c.crawled)}` : ""}. We haven't verified it, and their own terms decide what a guarantee or offer covers.</p>
        {urls.length ? <ul class="mt-2 space-y-1 font-normal">{urls.slice(0, 20).map((u) => <li class="break-all"><a href={u} rel="nofollow noopener" class="underline">{u.replace(/^https?:\/\/(www\.)?/, "")}</a></li>)}</ul> : null}
      </details>
    </Band>
  );
}

function GoodToKnow({ c }: { c: Company }) {
  if (!c.details.length) return null;
  const names = [...new Set(c.details.map((d) => d.name))];
  return (
    <section aria-labelledby="know" class="py-section">
      <Band>
        <SectionHead id="know" heading="Good to know" />
        <div class="mx-auto mt-8 max-w-3xl space-y-2">
          {names.map((n) => (
            <details class="rounded-control border border-line bg-surface px-4 py-3">
              <summary class="cursor-pointer select-none font-semibold">{title(n)}</summary>
              {c.details.filter((d) => d.name === n && d.value).map((d) => <p class="mt-2 text-ink-2">{d.value}</p>)}
            </details>
          ))}
        </div>
      </Band>
    </section>
  );
}

export function CompanyBody({ c }: { c: Company }) {
  const action = actionOf(c);
  const tel = c.phones[0]?.value;
  return (
    <div data-company={c.slug} class="pb-20 lg:pb-0">
      {c.siteDown ? <p class="bg-mark-soft px-5 py-2 text-center text-mark">Its website has not answered lately. These details were last confirmed {day(c.crawled)}.</p> : null}
      {c.leftSource ? <p class="bg-mark-soft px-5 py-2 text-center text-mark">This business was no longer in our source on {day(c.leftSource)}. It may have closed or moved.</p> : null}
      <Hero c={c} action={action} />
      {action && (c.offers.length || c.guarantees.length || c.reviewCards.length) ? (
        <div class="sticky top-0 z-30 hidden border-y border-line bg-surface/95 backdrop-blur lg:block">
          <div class="mx-auto flex max-w-wide items-center justify-between gap-6 px-8 py-2.5">
            <p class="flex min-w-0 items-center gap-3">
              {c.logo ? <img src={c.logo} alt="" class="h-8 w-auto max-w-20 object-contain" /> : null}
              <strong class="truncate font-semibold">{c.name}</strong>
            </p>
            <span class="flex shrink-0 items-center gap-4">
              {tel && action.href === "#request" ? <a href={telOf(tel)} class="font-semibold no-underline hover:underline">{tel}</a> : null}
              <a href={action.href} class={`${CTA} min-h-10`}>{action.label}</a>
            </span>
          </div>
        </div>
      ) : null}
      <ReviewsBand c={c} />
      <Offers c={c} />
      <Guarantees c={c} />
      <Services c={c} action={action} />
      <Work c={c} />
      <People c={c} action={action} />
      <RequestBand c={c} />
      <ReviewThemes c={c} />
      <Where c={c} />
      <GoodToKnow c={c} />
      <Sources c={c} />
      {action ? (
        <div class="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-surface p-3 lg:hidden">
          {tel && action.href === "#request" ? <a href={telOf(tel)} aria-label={`Call ${tel}`} class={`${CTA_QUIET} shrink-0`}><PhoneIcon /> Call</a> : null}
          <a href={action.href} class={`${CTA} grow`}>{action.label}</a>
        </div>
      ) : null}
    </div>
  );
}

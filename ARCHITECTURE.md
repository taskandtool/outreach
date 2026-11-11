# Outreach: architecture

`outreach` is the app's name. This is the design we build and check against as we go; change it
when the build teaches us something. `PROCESS.md` covers how the app runs.

## What it is

An app that builds a ready-made one-page site for every business in a niche and area, from what each
one already publishes, then emails the owner the link. It started as a copy of the niche expertise
app and keeps its finding, crawling, gathering and reading; it replaces the directory with one page
per company and adds the outreach.

The offer to each owner is one of two: use the page as your site, or let it bring you leads. The
agency's own site (`agency_url`) has the pricing and the way to get in touch.

## Decisions

1. **The company record is the center.** Everything gathered on a company is read once into one
   record: facts with their evidence. The page is built from the record, and only scripts go back to
   the raw files.
2. **Collect broadly, and label everything.** A reader always sees where a fact came from: "on their
   website", "running as an ad", "customers on Google say". Those are never blended.
3. **Confirm it is the same company before using a source.** A profile counts only if the company's
   site links to it, or its phone or domain matches. Anything else is held for a person.
4. **A page sells, truthfully.** Stars only from a platform's number, "free" only where the company
   says it, a section with nothing to say left out. Two values that disagree both show. Code counts.
5. **A preview is honest about what it is.** Every page says who made it, from what, and that it is
   not the company's official site. It is `noindex`, with no canonical and no sitemap, so it never
   competes with the company's own site in search; `robots.txt` allows crawling, so search engines
   see the noindex (a page blocked from crawling can still be indexed from links).
6. **Offers expire.** A script retires one past its date or gone from its source, and the browser
   takes one down on a page built before then.
7. **Nothing is emailed without the owner's yes.** Drafts wait for approval, `send --confirm` only
   adds approved leads to the campaign, and only the owner starts the campaign. An opt-out is kept
   forever and checked before every draft and send.
8. **Who to email, cheapest first, and only a safe address.** The company's own site, then Hunter,
   then a verifier. A Hunter 451 means that person asked not to be stored or contacted, so no address
   is kept for them.
9. **Source text is data, never instructions.** A site or review that says "ignore your
   instructions" is just text.
10. **The owner's rules win.** `SITE.md` is theirs: the agency, the domain, the sender, the campaign,
    the niche. Every AI run reads it and follows it over a skill's defaults.
11. **Every example is made up.** Companies, people, domains, phones and brands in code, tests, docs
    and skills are invented (`larkspur.example`, 555 numbers). Real data lives only in the gitignored
    working folders and `samples/`.

## What a company profile holds

The test of this whole design: can we fill this in?

| Reader wants | Comes from | Done by |
|---|---|---|
| **Name, phone, email, address, hours, booking link** | `tt-crawl`'s `_index/business-card.json` and `facts.json`, the Google listing, Overture | Script |
| **Logo** | `business-card.json`, Facebook or Google profile | Script |
| **Team and work photos** | Site (`_index/media.json`), Facebook photos, Instagram posts, Google photos | Script gathers, Codex sorts by kind |
| **Background:** founded, owners, size, story | About and team pages, LinkedIn company page, Facebook profile | Codex, with evidence |
| **Services and prices where stated** | Site, documents | Codex |
| **Guarantees and warranties** | Site, warranty PDFs (`tt-crawl docs`) | Codex |
| **Offers and promotions** | Site, Facebook and Instagram posts, Meta and Google ad libraries, reviews | Script gathers, Codex reads |
| **Brands they work with** | Site, posts | Codex |
| **Reviews and ratings** | Google, Trustpilot, Tripadvisor and others through connections; ratings shown on the site | Script gathers; code counts; Codex finds what they praise and complain about |
| **Testimonials** | `_index/reviews.json`, video and case-study pages | Script, labeled as chosen by the company |
| **Other proof:** awards, certifications, licenses, memberships, dealer status, press, client logos, years in business | Site, documents, posts | Codex |
| **Social presence** | `same_as` in `business-card.json`, then each profile | Script |
| **Where it works** | Address, stated service areas, locations | Script and Codex |

## Sources

Each is a connection the owner holds, and each has its own terms on storing and republishing,
which the owner accepts when connecting it. Google's are the strictest. A company page links
back to the original.

| Source | What it gives | Through |
|---|---|---|
| **The company's site** | Nearly everything above | `tt-crawl` (no connection) |
| **Linked documents** | Warranty terms, price lists, brochures | `tt-crawl docs` |
| **Overture Maps** | Finding businesses: names, sites, phones, categories, locations | `overturemaps`, free |
| **Google listing** | Rating, review count, a few reviews, hours, photos | `google-places`, `tt-crawl places` |
| **All Google reviews** | The full set, with dates and ratings | `dataforseo` |
| **Trustpilot, Tripadvisor, Yelp** | Not built. Add one when a niche relies on it | `dataforseo` or `apify` |
| **Facebook** | Profile, photos, posts | `scrapecreators` (`/v1/facebook/profile`, `/profile/photos`, `/profile/posts`) |
| **Instagram, TikTok** | Profile and posts | `scrapecreators` |
| **LinkedIn** | Company background and size | `scrapecreators` (`/v1/linkedin/company`) |
| **Running ads** | What it is promoting right now | `scrapecreators` (`/v1/facebook/adLibrary/company/ads`, `/v1/google/company/ads`) |
| **Business data** | Listings, categories, firmographics | `dataforseo`, `apollo` |
| **The owner** | A CSV or broker export, additions in chat, licensing board lists | Import |

Fetching runs with no AI, one company at a time, resuming after a stop, and saves everything to
files so a source is never paid for twice. Media URLs from vendors expire, so pictures are
downloaded when found.

### Pictures

- `tt-crawl` runs with `--images brand`, which fetches the logo, the og:image, the photographs
  most pages show and gallery pictures. `_index/media.json` lists each with its kind, alt text,
  the page and the heading beside it.
- Vendor pictures are added beside them.
- **A picture is looked at once.** `scripts/images.mjs` hashes each, drops tiny ones and near-copies, and draws the rest small on numbered sheets. The AI
  describes each, and the words stay in `raw/<company>/images.json`, keyed by the hash, so a re-crawl never pays to look again and code picks the record's `media` from them: the company's own
  pictures, people first, 12 at most.
- `web_photos.py`, from the brand skill, resizes the keepers for the web.
- A company page keeps about 12 pictures at most. Each shows with its source, and alt text from
  the page or the AI run. A national site would outgrow static files, and pictures would
  move to R2.

### Reviews

On by default where the owner has connections. An AI run reads a company's reviews and records what
they praise and complain about and which services they mention, with short quotes. A script does all
counting. A rating is shown per platform, never merged into a score of ours.


## The page and where it lives

One page per company, pre-rendered from `data/` to `dist/<slug>.html` and served from Cloudflare,
so the machine can sleep. It is the niche expertise app's company page, cut down to stand alone: the
hero with their best real photo and the quote form's button, the review band, offers, guarantees,
services, their work, their people, the quote form, what customers mention, the service area, and
the sources at the foot. No map, no lists and no links into a directory.

- **Addresses.** A company's page answers at `<url>/<slug>` on the app's own production address
  straight away. At `<slug>.<domain>`, the Worker answers `/` by the request's host and fetches that
  company's page; the bare domain redirects to the agency. That needs the domain's wildcard DNS
  pointed at this app's Worker, which an owner sets up outside the platform for now. There is no
  `index.html`, so `/` always reaches the Worker.
- **The quote form** saves each request to the project database (the `forms` skill's tables). Until a
  business says yes, requests come to us; `forward_leads` passes them on.
- **Visits.** `static/site.js` sends one beacon per page view with the email link's `?r=`; the Worker
  saves it to `page_visits` only for a company it knows. A mail scanner that fetches the link runs no
  script, so it does not count, and `?preview` keeps the owner's own checks out.
- **Ready to send.** A company gets a page whatever it holds, but only one with `gate.company_facts`
  kinds of fact is marked ready (`data/pages.json`), and only a ready page gets an email.

## Finding who to email

`contacts.mjs find`, cheapest first, each answer saved under `raw/<slug>/contact/` so nothing is
looked up twice:

1. The owner's name (a person in the record's background with an owner's role) and any address the
   site and profiles show. Free.
2. Hunter: `email-finder` with the owner's full name and the domain, else `domain-search` for decision
   makers, the owner's role first, then the highest confidence.
3. Hunter's `email-verifier` on the address chosen. Only `valid` is sendable. Hunter can't confirm
   webmail (Gmail, Outlook, which many small businesses use), so those go to MillionVerifier, where
   only `ok` is sendable.

The company's own address is used only when Hunter knows no one. A 451 records `blocked` with no
address; a 429 stops the run with progress kept.

## Sending

Instantly does the sending, from mailboxes the owner set up and warmed on a separate sending
domain, never the agency's main one. Its campaign holds the sequence (the first email and at most two
follow-ups), the sender's name, the postal address and the unsubscribe link, so the legal parts live
in one place the owner controls.

The app supplies what is particular to each lead. `outreach.mjs draft` writes `outreach/<slug>.md`
with the address, the person and the page link with its own `?r=`; the `cold-email` skill writes the
subject and opener; `outreach.mjs check` catches what is missing, too long or reads as AI. The owner
approves; `send --confirm` adds the approved leads to the campaign (`/api/v2/leads/add`, skipping
anyone already in the workspace or on its blocklist) with `personalization` and `page_url`. It never
activates the campaign. `outreach.mjs optout` keeps an opt-out forever in `outreach/optouts.csv`.

## On the machine

The app lives on its sprite, like every Starter App: the repository is the app, cloned to `~/app`. Dev
is the `web` service; production is `npm run deploy`, and only a person makes it public.

### Scripts

Node, one command per workflow, following the `agent-scripts` skill and the `data` skill's `cli.mjs`.
They reach vendors through the gateway and the platform through the bridge.

| Script | Does |
|---|---|
| `companies.mjs` | `find`, `crawl`, `gather` (with `--confirm`, since it spends credits) and `refresh`, all resuming after a stop |
| `pipeline.mjs` | `status`, `queue`, `next`/`done`/`retry company`, `tick` and `upkeep` |
| `check-record.mjs` | Every quote in its cited raw file, every value allowed, nothing from a held source |
| `images.mjs` | Pictures hashed, drawn on sheets, described once, chosen by code |
| `build-data.mjs` | `data/`: each company with contact details and ratings, offers retired, pictures resized, which pages are ready |
| `check.mjs` | `npm run check`: links and assets, out of search, the preview notice, quotes, offers, safety, size |
| `contacts.mjs` | `find` and `list`: who to email and whether it is safe to |
| `outreach.mjs` | `draft`, `check`, `list`, `approve`, `send`, `optout`, `visits` |

Behind them: `lib.mjs`, `merge.mjs`, `gather.mjs`, `evidence.mjs`, `geo.mjs`, and the usual site
scripts (`build.ts`, `dev.mjs`, `content.mjs`, `migrate.ts`, `test.mjs`, `forms`, `apply-design.mjs`).

### Skills

| Skill | When | What it covers |
|---|---|---|
| `read-company` | One company at a time | Reading everything gathered, writing the record with evidence, sorting pictures |
| `tidy-names` | After a batch of companies | `fields.yaml` on the sample, merging names in `aliases.yaml` |
| `cold-email` | After `outreach.mjs draft` | Each email's subject and opener, from the company's own page |
| `cross-check` | Before a first send and in the audit | Spot-checks against the live sources |
| `site` | Changing how the page works | The template, the Worker's routes, the preview notice |

`tropes`, `design`, `forms` and `data` are copied from the skills repository.

### Scheduled jobs

| Job | Type | When | Does |
|---|---|---|---|
| Run the pipeline | Command | Every 15 minutes, while work is queued | `pipeline.mjs tick` |
| Read next company | Prompt, 2 copies | Every 15 minutes, while companies are queued | `pipeline.mjs next company`, then `read-company` |
| Refresh offers | Command | Monthly | `companies.mjs refresh --offers` |
| Refresh everything | Command | Quarterly | `companies.mjs refresh --all` |
| Rebuild data | Command | Daily | `build-data.mjs` retires expired offers; deploying stays the owner's |
| Find new businesses | Command | Quarterly | `companies.mjs find`; new ones wait for a queue |
| Audit | Prompt | Monthly | The `cross-check` skill |

Contacts and sending are never scheduled: each spends or sends, so each waits for the owner.

## Cost

Reading costs what it does in the niche expertise app: about 55,000 tokens a company at medium effort,
$0.15 to $0.20 on Sol. Gathering is about 10 ScrapeCreators credits a company. Finding who to email is
at most three Hunter calls a company (a finder or search, and a verification), plus a MillionVerifier
check for each webmail address. Every one of these previews its cost before it spends. The pages
cost no AI.

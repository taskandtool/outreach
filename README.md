# Outreach

**An app your AI agent runs by chat to win web design clients.** The agent
builds a one-page site for every business in a trade and an area. Then it
drafts an email to each owner with the link.

[![Deploy on Task & Tool](https://taskandtool.com/images/deploy-button.svg)](https://taskandtool.com/accounts/register?starter_app=outreach)

It's made to run on Task & Tool. There, each app has a computer for your AI
agent. Your project gets a Postgres database for quote requests and page
visits. The agent uses the skills and scripts in this repo to find the
businesses, read what each one publishes, build its page and find who to
email. The agent runs scripts for the crawling, the counting and the
lookups. It does the reading and the writing itself. Instantly sends the
emails. The pages are built with Hono and Tailwind and served from
Cloudflare.

## Get started

Click the button above, or pick Outreach when you create an app on [Task &
Tool](https://taskandtool.com/starter-apps/outreach). Then ask for pages in
the chat: "Make outreach pages for HVAC companies in Denver."

## Features

### You choose the trade and the area

The agent finds the businesses in a metro, a state or the whole country from
Overture Maps, a free map dataset. You can also give it your own list as a
CSV. Before it spends anything, it tells you how many companies it found and
how many have a website. It also gives you a few examples to check and the
expected credits, AI cost and time. Then it waits for your yes.

### You check a sample of about 20 first

The agent runs the whole process on about 20 companies, large and small. You
look at their pages and decide whether the trade is worth the rest. The
agent also proposes the fields to collect for this trade. You edit the list.
Once the sample looks right, it reads the other companies.

### Facts come from the company's site, listings and ads

The agent reads each company's website and the warranty PDFs and other
documents it links to. With your connections it adds the Google listing, the
Facebook, Instagram and LinkedIn profiles, and the ads a company is running
now. A profile counts if the company's site links to it, or its phone or
domain matches. You settle any other match.

The agent writes one record per company: each fact with the place it came
from. It checks that the quotes in the record appear in what was gathered.
It looks at each picture once and saves a description of it.

### The agent builds a page from a business's facts

A page can have the Google rating, current offers, guarantees, services, the
company's work and people, what customers mention and the service area.
Visitors can ask for a quote on it. The agent leaves out a section when the
company has nothing for it. The agent shows a star rating as the platform
reports it. A page says "free" where the company does. Offers come off the
page after their end date.

Each page has a notice with your agency's name and a line saying it isn't
the company's official site. It's kept out of search results with a noindex
tag, no canonical tag and no sitemap.

After the first deploy, a company's page is at `<production
address>/<company>`. Once you point your domain's wildcard DNS at the app's
Worker, it is also at `<company>.<your domain>`. You set that up outside
Task & Tool for now. The emails use that address once `domain` is filled in
`SITE.md`. Visitors to the bare domain go to your agency's site.

### Checks before every deploy

`npm run deploy` runs `npm run check` first and stops on any finding. The
main checks:

| Check | What it catches |
|---|---|
| Links | Broken links and missing scripts or stylesheets |
| Search | A page open to search, a canonical tag, a sitemap, or a `robots.txt` that blocks crawlers |
| Preview | A page that doesn't say it's a preview |
| Facts | Quotes that don't match what was gathered, offers past their date, profiles with no confirmed match, and review or rating markup |
| Safety | HTML from a source that would run on the page |
| Copy | Wording that sounds like AI in the templates and records |
| Setup | TypeScript errors, an empty `agency_url`, a record's private notes on a page, and files too many or too large for Cloudflare |

### The agent finds the owner and checks the address

It starts with the cheapest source. First it looks for the owner's name and
any address on the company's site and profiles. Then it asks Hunter for the
owner's email by name, or searches the domain for decision makers. Last, it
checks the address with Hunter's verifier. Many small businesses use Gmail
or Outlook addresses. Hunter can't confirm them. The agent checks those with
MillionVerifier instead. An address that fails its check gets no email.

Before any lookup, the agent shows you how many Hunter calls it would make.
The agent saves each answer and doesn't repeat a lookup. If Hunter says a
person asked not to be contacted, the agent stores no address for them and
never emails them.

### The subject and opener come from the owner's page

The subject is under 60 characters and names the business and one true thing
about it: "Larkspur's 10-year labor guarantee on one page". The opener is
one or two sentences on what comes first on their page. The agent mentions a
number, guarantee or offer only if their page shows it. The agent checks
each draft for a missing part, an over-long subject or opener, and wording
that reads as AI. If it finds nothing true and specific to say about a
company, that company gets no email. The agent tells you which companies
those are.

### You approve every email and start the campaign

You read the list of drafts and say which ones go. The agent adds those to
your Instantly campaign. It skips anyone already in your Instantly workspace
or on its blocklist. Instantly sends from mailboxes you set up and warmed on
a separate sending domain. Nothing goes out until you start the campaign in
Instantly.

In the US, the CAN-SPAM Act requires a postal address and a clear way to opt
out in every commercial email. Other countries can be stricter. Check the
law where your recipients are before you send.

You set up the campaign in Instantly once. Its sequence is the first email
and at most two follow-ups. Put the sender's name, your postal address and
Instantly's unsubscribe link in it. The agent adds no leads until the
sender's name and postal address are filled in `SITE.md`. An opt-out is kept
forever and checked before a draft is written or sent.

### You see which owners opened their page

The link in an email has a code for that company. You see how many visits a
company's page had and the date of the last one. When an owner opens the
page from that link, the agent marks them as a warm lead. Call those owners
first. Visits from mail scanners don't count. Neither do your own visits
with `?preview`.

### Quote requests come to you first

A visitor's quote request is saved in the project database. Requests come to
you until the business says yes. Then you turn on `forward_leads` in
`SITE.md` and connect Resend or Postmark. After that, requests go to the
address the company publishes.

### Scheduled jobs

| Job | When | What it does |
|---|---|---|
| Run the pipeline | Every 15 minutes while work is queued | Crawls and gathers the next companies, with no AI |
| Read next company | Every 15 minutes while companies are queued, two at once | Reads one company and writes its record |
| Rebuild data | Daily | Takes expired offers off the pages, with no AI and no spending |
| Refresh offers | Monthly | Checks ads and recent posts for new offers |
| Audit | Monthly | Spot-checks company facts against the live sources |
| Refresh everything | Quarterly | Re-reads sites, profiles and reviews. Companies with no changes cost no AI. |
| Find new businesses | Quarterly | Adds new companies. You choose when to queue them. |

Finding contacts, adding leads to Instantly and deploying are never
scheduled. The agent does them when you ask.

### Skills in this repo

A skill is a set of instructions the agent loads when a task needs it. This
repo has 9:

| Skill | What it does |
|---|---|
| `read-company` | Reads everything gathered on one company and writes its record with evidence |
| `tidy-names` | Proposes the fields for a trade and merges names that mean one thing |
| `cross-check` | Spot-checks facts against the live sources before a first send and in the audit |
| `cold-email` | Writes each email's subject and opener |
| `site` | Changes the page, the quote form and the preview notice |
| `design` | Sets the colors, type and layout |
| `tropes` | Spots phrases that read as machine-written |
| `forms`, `data` | The quote form, the database and the spam trap |

### What it costs

Gathering takes about 10 ScrapeCreators credits a company. Finding who to
email takes at most three Hunter calls a company, plus a MillionVerifier
check for each Gmail or Outlook address. Building the pages costs no AI.

## Why run it on Task & Tool

Task & Tool is the easiest place to run it: your connections, the database
and the schedule are already there for the agent. Each app gets:

- Its own computer for the agent, and a dev address where your team checks
  pages before they go live
- A Postgres database for quote requests and page visits. You can roll it
  back to an earlier point in time.
- Publishing on your own domain with a free SSL certificate. Only your team
  sees production until you make it public.
- Connections to Google Places, ScrapeCreators, Hunter, MillionVerifier and
  Instantly. Their keys stay out of this repo.
- Scheduled jobs for the reading, the refreshes and the audit above

## Make it your own

Ask the agent for any change in the chat. To start from your own copy, fork
this repo, change what you like, and start a new app from your fork on Task
& Tool. You can also copy its skills from `.claude/skills/` into another
repo.

## What's in the repo

```
src/              the page, its parts, the quote form and the Worker's routes
scripts/          finding, reading, contacts, emails, the build and checks
design/           the design system
styles/           the Tailwind theme, compiled from the design system
static/           the browser script and the icons
test/             the tests
.claude/skills/   the 9 skills
SITE.md           your rules: the agency, the domain, the sender, the campaign
PROCESS.md        how the app runs, step by step
ARCHITECTURE.md   why it works the way it does
AGENTS.md         what the agent reads first
.taskandtool/     setup for an install on Task & Tool
starter-app.json  what the app needs and its chat suggestions
```

Your working data (`companies.csv`, `raw/`, `records/`, `data/` and
`outreach/`) stays out of git. On Task & Tool, it comes back from backups on
a new machine.

## Commands

The agent runs these on the app's computer. To work on it on your own
computer, install Node 20 or later and run `npm install`. Then `npm run
dev`, `npm run check` and `npm test` work there too. A fresh clone has no
companies. There are no company pages until `data/` is built.

- `npm run dev` serves the pages on localhost:3000, with a company's page at
  `/<company>`. The quote form and visits need a database in `DATABASE_URL`.
- `npm run check` builds the pages and runs every check. `npm run check --
  --built` checks the pages already in `dist/`.
- `npm test` runs 131 tests on the scripts and the page.
- `npm run deploy` builds, checks and publishes the pages to production. It
  works only on Task & Tool.
- `node scripts/pipeline.mjs status` shows what is waiting at each stage.
  `AGENTS.md` lists every other script. Each takes `--help`.

## Third-party tools

- [`tt-crawl`](https://github.com/taskandtool/crawler), our crawler, for
  reading sites, and `overturemaps` (MIT) for finding businesses.
- npm packages, MIT: `hono`, `@hono/node-server`,
  `@neondatabase/serverless`, `marked`, `tailwindcss` + `@tailwindcss/cli`,
  `esbuild`, `tsx`, `pg`; `yaml` (ISC) and `typescript` (Apache-2.0).

## Contributing

Pull requests are welcome. The repo holds no credentials. We run a secret
scan before each push.

## License

MIT. See `LICENSE`.

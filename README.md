# Outreach

**An app for winning web design clients.** You run it by chatting with your
AI agent. The agent builds a one-page site for every business in a trade and
an area. Then it drafts an email to each owner with the link.

[![Deploy on Task & Tool](https://taskandtool.com/images/deploy-button.svg)](https://taskandtool.com/accounts/register?starter_app=outreach)

![Larkspur Heating & Air's page on a desktop and a phone](https://taskandtool.com/images/starter-apps/outreach.webp)

It's made to run on Task & Tool. Each app there has a computer for your AI
agent. Your project gets a Postgres database for quote requests and page
visits. The agent uses the skills and scripts in this repo to find the
businesses, read what each one publishes, build its page and find who to
email. The agent runs scripts for the crawling, the counting and the
lookups. It does the reading and the writing itself. You send the emails
from Instantly. The pages are built with Hono and Tailwind and served from
Cloudflare.

## Get started

Click the button above, or pick Outreach when you create an app on [Task &
Tool](https://taskandtool.com/starter-apps/outreach). Then ask for pages in
the chat: "Make outreach pages for HVAC companies in Denver."

See it in use on the [Outreach
page](https://taskandtool.com/starter-apps/outreach).

## Features

### You choose the trade and the area

The agent finds the businesses in a metro, a state or the whole country from
Overture Maps, a free map dataset. You can also give it your own list as a
CSV. Before it spends anything, it tells you how many companies it found and
how many have a website. It also gives you a few examples to check and the
expected credits, AI cost and time. Then it waits for you to approve.

### You check a sample of about 20 first

The agent runs the whole process on about 20 companies, large and small. You
look at their pages and decide whether the trade is worth the rest. The
agent also proposes the fields to collect for this trade. You edit the list.
Once the sample looks right, the agent reads the other companies.

### The agent reads the company's site, listings and ads

The agent reads each company's website and the warranty PDFs and other
documents linked there. With your connections it adds the Google listing,
the Facebook, Instagram and LinkedIn profiles, and the ads a company is
running now. The agent uses a profile when the company's site has a link to
it or the phone number or domain match. You decide on any other match.

The agent writes one record per company: each fact with its source. It
checks the quotes in the record against the text it gathered. It looks at
each picture once and writes a description.

### A page for each business

A page can have the Google rating, current offers, guarantees, services, the
company's work and people, what customers mention and the service area.
Visitors can ask for a quote on it. The agent leaves out a section when the
company has nothing for it. Star ratings are shown exactly as they are on
the review site. It writes "free" where the company does. Offers are taken
off the page after their end date.

Each page has your agency's name and a notice that it isn't the company's
official site. It's kept out of search results with a noindex tag, no
canonical tag and no sitemap.

After the first deploy, a company's page is at `<production
address>/<company>`. Once you point your domain's wildcard DNS at the app's
Worker, it is also at `<company>.<your domain>`. You set that up outside
Task & Tool for now. Once you fill in `domain` in `SITE.md`, the agent puts
that address in the emails. Visitors to the bare domain go to your agency's
site.

<img src="https://taskandtool.com/images/marketing/quillmark-larkspur-phone.webp" width="300" alt="Larkspur Heating & Air's page at phone width: same-day AC repair, a $69 tune-up and a 10-year labor guarantee">

### Checks before every deploy

The agent can't deploy while `npm run check` has any finding. The main
checks:

| Check | What counts as a finding |
|---|---|
| Links | Broken links and missing scripts or stylesheets |
| Search | A page open to search, a canonical tag, a sitemap, or a `robots.txt` that blocks crawlers |
| Preview | A page that doesn't say it's a preview |
| Facts | Quotes that don't match what was gathered, offers past their date, profiles with no confirmed match, and review or rating markup |
| Safety | HTML from a source that would run on the page |
| Copy | Wording that sounds like AI in the templates and records |
| Setup | TypeScript errors, an empty `agency_url`, a record's private notes on a page, and files over Cloudflare's count or size limits |

### The agent finds the owner and checks the address

The agent starts with the cheapest source. First it looks for the owner's
name and any address on the company's site and profiles. Then it asks Hunter
for the owner's email by name, or searches the domain for decision makers.
Last, it checks the address with Hunter's verifier. Many small businesses
use Gmail or Outlook addresses. Those can't be confirmed with Hunter. The
agent checks them with MillionVerifier instead. The agent drops any address
that fails the check.

Before any lookup, the agent shows you how many Hunter calls it would make.
The agent keeps each result and doesn't look anyone up twice. If a person
has opted out with Hunter, the agent doesn't keep their address or add them
to a campaign.

### The agent writes the subject and opener from the owner's page

The subject is under 60 characters. It has the business's name and one true
thing about it: "Larkspur's 10-year labor guarantee". The opener is one or
two sentences on what's at the top of their page. The agent mentions a
number, guarantee or offer only if it's on their page. The agent checks each
draft for missing parts, a subject or opener that's too long, and wording
that sounds like AI. If it finds nothing true and specific to say about a
company, that company gets no email. The agent tells you which companies
those are.

### You approve every email and start the campaign

You read the list of drafts and say which ones to send. The agent adds those
to your Instantly campaign. It skips anyone already in your Instantly
workspace or on your Instantly blocklist. You send through Instantly from
mailboxes you set up and warmed on a separate sending domain. No one gets an
email until you start the campaign in Instantly.

You set up the campaign and its follow-ups in Instantly. People who opt out
aren't emailed again.

### You see which owners opened their page

The link in an email has a code for that company. You see how many visits a
company's page had and the date of the last one. When an owner opens the
page from that link, the agent marks them as a warm lead. Call those owners
first. Visits from mail scanners aren't counted. Neither are your own visits
with `?preview`.

### You get the quote requests first

A visitor's quote request is saved in the project database. You get the
requests until the business says yes. Then you turn on `forward_leads` in
`SITE.md` and connect Resend or Postmark. After that, the company gets them
at the address it publishes.

### Scheduled jobs

| Job | When | What happens |
|---|---|---|
| Run the pipeline | Every 15 minutes while work is queued | Crawling and gathering sources for the next companies. No AI. |
| Read next company | Every 15 minutes while companies are queued, two at once | The agent reads one company and writes its record |
| Rebuild data | Daily | Expired offers are taken off the pages. No AI and no spending. |
| Refresh offers | Monthly | The agent checks ads and recent posts for new offers |
| Audit | Monthly | The agent spot-checks company facts against the live sources |
| Refresh everything | Quarterly | The agent re-reads sites, profiles and reviews. Companies with no changes cost no AI. |
| Find new businesses | Quarterly | New companies are added. You choose when to queue them. |

Finding contacts, adding leads to Instantly and deploying are never
scheduled. The agent does them when you ask.

### Skills in this repo

A skill is a set of instructions the agent loads when it needs them. This
repo has 9:

| Skill | Used for |
|---|---|
| `read-company` | Reading everything gathered on one company and writing its record with evidence |
| `tidy-names` | Proposing the fields for a trade and merging names that mean the same thing |
| `cross-check` | Spot-checking facts against the live sources before a first send and in the audit |
| `cold-email` | Writing each email's subject and opener |
| `site` | Changing the page, the quote form and the preview notice |
| `design` | Setting the colors, type and layout |
| `tropes` | Spotting phrases that read as machine-written |
| `forms`, `data` | The quote form, the database and the spam trap |

### What it costs

Gathering takes about 10 ScrapeCreators credits a company. Finding who to
email takes at most three Hunter calls a company, plus a MillionVerifier
check for each Gmail or Outlook address. Building the pages costs no AI.

## Why run it on Task & Tool

Task & Tool is the easiest place to run it: your connections, the database
and the schedule are already there for the agent. Each app has:

- Its own computer for the agent
- A dev address your team opens to check pages before you publish them
- Access to the project's Postgres database for quote requests and page
  visits. You can roll it back to an earlier point in time.
- Publishing on your own domain with a free SSL certificate. Only your team
  sees production until you make it public.
- Connections to Google Places, ScrapeCreators, Hunter, MillionVerifier and
  Instantly. We hold their keys.
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
`outreach/`) isn't in git. On Task & Tool, we back it up and restore it if
your app moves to a new machine.

## Commands

The agent runs these on the app's computer. To run the app on your own
computer, install Node 20 or later and run `npm install`. Then you can run
`npm run dev`, `npm run check` and `npm test` there too. A fresh clone has
no companies. There are no company pages until `data/` is built.

- Run `npm run dev` to see the pages on localhost:3000. A company's page is
  at `/<company>`. The quote form and visits need a database in
  `DATABASE_URL`.
- Run `npm run check` to build the pages and run every check. Add `--
  --built` to check only the pages already in `dist/`.
- Run `npm test` for the tests on the scripts and the page.
- The agent runs `npm run deploy` to build, check and publish the pages to
  production. It's for Task & Tool only.
- Run `node scripts/pipeline.mjs status` to see what's queued at each stage.
  The other scripts are listed in `AGENTS.md`. Each has a `--help`.

## Third-party tools

- [`tt-crawl`](https://github.com/taskandtool/crawler), our crawler, for
  reading sites, and `overturemaps` (MIT) for finding businesses.
- npm packages, MIT: `hono`, `@hono/node-server`,
  `@neondatabase/serverless`, `marked`, `tailwindcss` + `@tailwindcss/cli`,
  `esbuild`, `tsx`, `pg`; `yaml` (ISC) and `typescript` (Apache-2.0).

## Contributing

Pull requests are welcome. The repo has no credentials. We run a secret scan
before each push.

## License

MIT. See `LICENSE`.

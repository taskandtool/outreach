# Outreach: process

How the app runs: starting a niche, keeping the pages current, and reaching each owner.
`ARCHITECTURE.md` describes the scripts, skills and jobs named here.

The rules throughout:

- Scripts move the work along. AI is only called for what takes understanding.
- Each stage has a check, and later stages wait for it.
- Spending needs the owner's yes first: connection credits, Hunter lookups, and AI over a whole area.
- Nothing is emailed without the owner's yes, and only the owner starts a campaign.
- Every job can run again safely and picks up where it stopped.

## Part 1: Starting a niche

### 1. Set the scope

Agree with the owner, and record in `SITE.md`:

- The niche and the area: a metro, a state, or national and online.
- The agency: its name and its site (`agency_url`), where a business can see pricing and get in touch.
- The domain the pages live on (`domain`): each company at `<slug>.<domain>`.
- Who sends the emails (`sender`): a real person's name, an address on a separate, warmed sending
  domain, and the agency's postal address, which every email carries.

Then ask for the connections this will use (`google-places`, `scrapecreators`, and later `hunter`,
`millionverifier` and `instantly`) with `python3 ~/tools/taskandtool.py request-connection`. The app
works with whichever it holds, and with only the company sites if it holds none.

### 2. Find businesses and estimate

`companies.mjs find` gets the list from Overture, an import or a connection, and removes duplicates.
Tell the owner how many companies it found, how many have websites, a few examples to sanity-check,
and the expected credits, AI cost and time. Wait for a yes.

### 3. Calibrate on a sample

Run the real pipeline on about 20 companies, a mix of large and small, before the rest:

`pipeline.mjs queue --sample 20` queues them and starts `tick`, which crawls them and gathers from the
other sources. Then:

1. **Check the matches.** Read `raw/<company>/matches.json` for a few. Is that the right Facebook page?
   A person settles any close calls.
2. **What did each source add?** `pipeline.mjs status` reports it per company.
3. **Fields.** The `tidy-names` skill proposes `fields.yaml` from a handful of companies. The owner edits it.
4. **Read the sample.** `tick` adds the "Read next company" jobs, and each run writes a record.
5. **Look at the pages.** `build-data.mjs`, then `npm run dev` and open `/<slug>` for a few. Would the
   owner of that business want this as their site? Would they be glad a stranger saw it?
6. **Is there enough here?** If most companies yield too little for a page worth sending, the owner
   decides whether this niche is worth continuing.

Adjust the `read-company` skill and `fields.yaml` and repeat until these pass.

### 4. Read every company

`pipeline.mjs queue --all` queues the rest and starts `tick`. Each read run is a fresh chat that claims
one company with `pipeline.mjs next company`, reads what was gathered, looks at each picture once on
the sheets from `images.mjs`, writes `records/<company>.md`, runs `check-record.mjs`, and marks it with
`pipeline.mjs done`. A company that fails three times is left unmarked and reported, and the rest
carry on. The `read-company` skill holds the reading rules.

### 5. Build, review, deploy

1. `build-data.mjs` builds `data/`; a company with fewer than `gate.company_facts` kinds of fact gets a
   page but is not marked ready, so no email links it.
2. `npm run deploy` runs every check, then deploys. The first deploy opens production to the team only.
3. `tt-crawl shoot /<slug>` shows a page at phone and desktop widths. The owner reads a few as the
   business would.

Each page answers at `<url>/<slug>` straight away. `<slug>.<domain>` answers once the domain's wildcard
DNS points at this app's Worker.

## Part 2: Keeping the pages current

The "Refresh offers" job checks ads and recent posts monthly; new material queues that company for a
fresh read, and an offer no longer running is retired by code. The daily "Rebuild data" job retires
offers past their end date, with no AI and no spending; deploying stays the owner's. The quarterly
"Refresh everything" job re-reads sites, profiles and reviews, and only companies whose material
changed cost AI. The quarterly "Find new businesses" job adds what is new, which waits for a queue.

A business that asks for a change or a takedown gets it, and a person decides how: a correction goes
in its record with "corrected by the business" and the date; a takedown removes the page
(`state: removed` in `companies.csv`, then a rebuild and a deploy) and records an opt-out for its address.

## Part 3: Reaching each owner

### 1. Who to email

`contacts.mjs find` previews how many Hunter calls it would make. With the owner's yes,
`contacts.mjs find --confirm` looks at each company with a ready page, cheapest first:

1. The owner's name and any address its own site and profiles show.
2. Hunter: the email-finder with the owner's name, else a domain search for decision makers.
3. Hunter's verifier on the address chosen; a Gmail or Outlook address again with MillionVerifier.
   Only `valid` (and MillionVerifier's `ok`) is sendable.

A Hunter 451 means that person asked not to be stored or contacted: the app keeps no address for them,
ever. A 429 stops the run with progress kept. Each answer is saved in `raw/<slug>/contact/`, so nothing
is looked up twice.

### 2. Drafts and the approval list

`outreach.mjs draft` writes `outreach/<slug>.md` for each sendable contact: the address, the person,
and the page's link with its own `?r=` so a visit names the lead. The `cold-email` skill writes each
subject and opener. `outreach.mjs check` must pass, then show the owner `outreach.mjs list`. Approve
only what they say yes to: `outreach.mjs approve <slug>...`.

### 3. Sending

The owner makes the campaign in Instantly once: its sequence is the first email and at most two
follow-ups, with `{{personalization}}` for the opener, `{{page_url}}` for the link, the sender's name,
the postal address and Instantly's unsubscribe link. Its id goes in `SITE.md` as `instantly_campaign`.

`outreach.mjs send` lists who would be added; `send --confirm`, when the owner asks, adds the approved
leads with their opener and link. Nothing goes out until the owner starts the campaign in Instantly.

### 4. Opt-outs, replies and visits

- An opt-out, in a reply or anywhere else: `outreach.mjs optout <email>`. It is kept forever in
  `outreach/optouts.csv` and checked before every draft and send. If the lead is already in the
  campaign, remove it in Instantly too.
- `outreach.mjs visits` shows who opened their page, and a warm lead where a visit came from its
  email's link. A mail scanner fetching the link runs no script, so it doesn't count.
- A visitor's quote request is saved (`forms.mjs submissions --form quote`) and comes to us; passing
  it on to the business is a separate yes (`forward_leads`).

## Health

`npm run check` blocks a deploy for: a broken link or a missing script or stylesheet; a page open to
search, a canonical tag, a sitemap, or a `robots.txt` that blocks crawling (search must see the noindex); a page that does not say it
is a preview; any review or rating markup; a quote that does not match `raw/`; an offer shown as current
after it expired; a profile used without a confirmed match; text from a record's body on a page; HTML
that would run; AI tells in the templates or records; no `agency_url`.

The monthly "Audit" job, with the `cross-check` skill, spot-checks company facts against the live sources.

## When something goes wrong

| Problem | Do this |
|---|---|
| A record keeps failing its checks | Leave it unmarked, report it; that company gets no email |
| A site blocks the crawler | Record it, and build its page from its other sources, or leave it out |
| A profile might be the wrong company | Hold it for a person, and use nothing from it until then |
| A vendor is out of credits or fails | The run stops that source, keeps progress, and says why |
| Hunter answers 451 for someone | Never store or contact them; `contacts.mjs` already keeps no address |
| A business says its page is wrong | Fix it first and find out why after; take the page down if they ask |
| Someone asks not to be emailed | `outreach.mjs optout <email>` and remove them from the campaign in Instantly |

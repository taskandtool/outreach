# Outreach

Builds a ready-made one-page site for every business in a niche and area, from what each one
already publishes, then emails the owner the link. Two offers follow: use the page as your site,
or let it bring you leads.

- **A page that sells, truthfully:** each company's promise, reviews, offers, guarantees, people and
  work, all from what it states, with a quote form. A preview, out of search, that says who made it.
- **Its own address:** `<your site>/<company>` from the first deploy, and `<company>.<your domain>`
  once that domain's wildcard DNS points at the app. The bare domain sends visitors to your agency's site.
- **Who to email, cheapest first:** the owner's name and address from their own site, then Hunter,
  then a check that the address is safe to send to (MillionVerifier for Gmail and Outlook).
- **Nothing goes out without you:** drafts wait for your yes; approved ones go into your Instantly
  campaign, which sends only when you start it. Opt-outs are kept forever.
- **Warm leads:** a visit from an email's link is counted, so you know who looked.

This repository *is* the app. On Task & Tool it is cloned onto the app's own machine; it also runs
anywhere with Node 20, Python 3, [tt-crawl](https://github.com/taskandtool/crawler) and `overturemaps`.

## How it works

Scripts find the businesses (free, from Overture Maps, or your own CSV), crawl their sites and call
whichever sources you have connected, saving everything to files so nothing is paid for twice. One AI
run per company reads what was gathered and writes a record: facts, each with a short exact quote,
which a script traces back to the source. Code builds each page from the record.

Start by telling the AI which businesses and where. It shows you the list and the cost before spending
anything, reads a sample for you to judge, and only then reads the rest. `PROCESS.md` has the whole run
and `ARCHITECTURE.md` the reasoning. Your data (`companies.csv`, `raw/`, `records/`, `data/`,
`outreach/`) stays out of git and comes back from backups on a new machine.

Sources you can connect, none required: Google Places, ScrapeCreators, Hunter, MillionVerifier and
Instantly. Each has its own terms, which you accept when you connect it. Cold email has its own law
where you send it: every email carries your postal address and an unsubscribe link.

## Developing

`npm test` runs the scripts' tests. `npm run dev` serves on localhost:3000; a company's page is at `/<slug>`.
`npm run check` tests what a visitor would get, and `npm run check -- --built` the built pages too.
`SITE_ROOT=<folder>` keeps a sample's working data apart from the code.

A pre-push secret scan guards this repository. It holds no credentials by design.

## License

MIT. See `LICENSE`.

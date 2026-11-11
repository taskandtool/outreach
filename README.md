# Outreach

Win web design clients by showing them their new site before you ask. Outreach builds a polished
one-page site for every business in a niche and area, from what each one already publishes, and
emails the owner the link.

- **A page they'll want to keep:** their promise, reviews, offers and work, with a quote form, on
  its own address.
- **Reaches the owner,** not a shared inbox, and only at addresses that are safe to send to.
- **Every email is yours to approve,** and the campaign starts only when you start it.
- **Know who's interested:** see which owners opened their page.

This repository *is* the app. On Task & Tool it is cloned onto the app's own machine; it also runs
anywhere with Node 20, Python 3, [tt-crawl](https://github.com/taskandtool/crawler) and `overturemaps`.

## How it works

Tell the AI the trade and the area. It builds the pages and shows you a sample first. When you like
them, it finds who to email and drafts each message for your approval. Every email carries your
postal address and an unsubscribe link, as cold-email law requires.

Each page is at `<your site>/<company>` from the first deploy, and at `<company>.<your domain>` once
that domain's wildcard DNS points at the app. The bare domain sends visitors to your agency's site.

Connections, none required: Google Places, ScrapeCreators, Hunter, MillionVerifier and Instantly.
Each has its own terms, which you accept when you connect it.

## Off Task & Tool

`npm install && npm run dev` serves the pages, and `npm run build` writes `dist/` and
`build/worker.mjs` (`wrangler.jsonc` deploys them to your own Cloudflare account). Set `DATABASE_URL`
to a Neon database to save quote requests and count visits; without it the pages still work. Finding
companies and contacts, the pictures and the scheduled runs are Task & Tool's: they call the
connections above through its gateway and run from its scheduler.

## Developing

`npm test` runs the scripts' tests. `npm run dev` serves on localhost:3000; a company's page is at `/<slug>`.
`npm run check` tests what a visitor would get, and `npm run check -- --built` the built pages too.
`SITE_ROOT=<folder>` keeps a sample's working data apart from the code. `PROCESS.md` and
`ARCHITECTURE.md` are for whoever works on the app.

Your data (`companies.csv`, `raw/`, `records/`, `data/`, `outreach/`) stays out of git and comes back
from backups on a new machine. A pre-push secret scan guards this repository, which holds no
credentials by design.

## License

MIT. See `LICENSE`.

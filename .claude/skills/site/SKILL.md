---
name: site
description: "Changes how a company's page works: its sections, the quote form, the preview notice, the Worker's routes and the look. Use for any change to the page or the build. Not for what a company's page says (its record: read-company)."
---

# The page

Done when `npm run check` passes and `tt-crawl shoot /<slug>` shows the page right at phone and desktop width.

There is one page per company: Hono templates pre-rendered to static HTML from `data/`. The pages
are served from Cloudflare so the machine can sleep.

- `src/app.tsx` is every pre-rendered route (`/<slug>`), `src/pages/company.tsx` the page,
  `src/components.tsx` its parts, `src/shell.tsx` the document with the preview notice. `src/data.ts`
  reads `data/`. These run on the machine only.
- `src/public.tsx` is all the Worker carries: `/` by host (a company's subdomain gets its page, the
  bare domain the agency), quote requests (`src/leads.tsx`), visits (`src/visits.ts`), the 404. Keep it
  free of Node built-ins and `data.ts`; `npm run check` fails otherwise. There is no `index.html`,
  so a request for `/` always goes to the Worker.
- `static/site.js` takes down an offer past its date, fetches the quote form's spam stamp, and sends
  one visit with the email link's `?r=`.
- The look is `design/system.yaml`: `npm run apply-design`, tokens only in markup (the `design` skill).

Rules for the page. `npm run check` tests some of them:

- The page is a preview and says so: who made it, from what, and that it is not the company's
  official site. It is `noindex`, with no canonical and no sitemap. `robots.txt` allows crawling so
  that search engines see the `noindex`.
- Write it as a sales page in which every claim is true: stars only from a platform's number, "free"
  only where the company says it, a named person only beside a picture that names them. Leave out a
  section with nothing to say. Every number comes from `data/`; never type one into a template.
- Show a rating as its platform's. Add no score of ours and no review markup. If the review band
  shows only 4 and 5 star reviews, say so on the band. Show a complaint only as a trend.
- Render source text only as text: never `raw()` it. A link is web, mail or phone.
- Write plain labels and plain benefits. Then read the page cold against
  `.claude/skills/tropes/references/copy.md` for what the script misses.

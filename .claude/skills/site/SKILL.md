---
name: site
description: "Changes how a company's page works: its sections, the quote form, the preview notice, the Worker's routes and the look. Use for any change to the page or the build. Not for what a company's page says, which comes from its record (read-company)."
---

# The page

One page per company, Hono templates pre-rendered to static HTML from `data/`, served from
Cloudflare, so the machine can sleep.

- `src/app.tsx` is every pre-rendered route (`/<slug>`), `src/pages/company.tsx` the page,
  `src/components.tsx` its parts, `src/shell.tsx` the document with the preview notice. `src/data.ts`
  reads `data/`. These run on the machine only.
- `src/public.tsx` is all the Worker carries: `/` by host (a company's subdomain gets its page, the
  bare domain the agency), quote requests (`src/leads.tsx`), visits (`src/visits.ts`), the 404. It must
  stay free of Node built-ins and `data.ts`; `npm run check` fails otherwise. There is no `index.html`,
  so `/` always reaches it.
- `static/site.js` takes down an offer past its date, fetches the quote form's spam stamp, and sends
  one visit with the email link's `?r=`.
- The look is `design/system.yaml`: `npm run apply-design`, tokens only in markup (the `design` skill).

Rules the page keeps, which `npm run check` tests:

- It is a preview, and says so: who made it, from what, and that it is not the company's official
  site. It is `noindex`, with no canonical and no sitemap; `robots.txt` allows crawling, so search engines see the noindex.
- It sells, and every claim on it is true: stars only from a platform's number, "free" only where the
  company says it, a named person only beside a picture that names them. A section with nothing to say
  is left out. Code counts: a number comes from `data/`, never typed into a template.
- A rating stays its platform's; there is no score of ours and no review markup. The review band says
  when it shows only 4 and 5 stars. A complaint shows only as a trend.
- Source text is rendered only as text: never `raw()` it. A link is web, mail or phone.
- Copy is plain labels and plain benefits; a cold read against `.claude/skills/tropes/references/copy.md`
  catches what the script can't.

Done when `npm run check` passes and `tt-crawl shoot /<slug>` shows the page right at phone and desktop width.

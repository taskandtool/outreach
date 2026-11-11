---
name: cold-email
description: "Writes the subject and opener of each outreach email, in outreach/<slug>.md, from that company's own page. Use after outreach.mjs draft, or when asked to write, rewrite or shorten the emails (\"draft the emails\", \"make the subject punchier\"). Not for sending or approving (PROCESS.md Part 3)."
---

# The subject and opener

Done when each draft's `subject` and `opener` are filled and `node scripts/outreach.mjs check`
passes. The owner then reads `outreach.mjs list` and approves; you never approve or send.

The campaign's sequence in Instantly holds the rest of the email: who we are, the two offers, the
link (`{{page_url}}`), the postal address and the unsubscribe. Each draft gives it only two lines,
so they carry everything particular to this company.

Read the company's page (`npm run dev`, then `/<slug>?preview`, so the visit isn't counted) and its
record, `records/<slug>.md`. Then:

- **The subject names the business and one true thing about it,** under 60 characters, in their
  words where you can: `Larkspur's 10-year labor guarantee, on one page`. It never claims to
  be from them, never "Re:", and never promises what the page doesn't show.
- **The opener is one or two sentences about them,** what leads their page and why that is the
  thing a customer would want first: `Your 10-year labor guarantee leads the page we built from
  your website, ahead of the reviews.` Use the person's first name only if the draft has one.
- **Every fact is theirs.** A number, a guarantee or an offer appears only if their page shows it.
  No flattery you can't point to, no "I noticed", no claim about their business you can't see.
- Plain words the owner would say out loud; the tropes check in `outreach.mjs check` catches the rest.

Write them into the draft's front matter, leave `status: draft`, and run the check. Fix what it
finds; a company with nothing true and particular to say gets no email: tell the owner which.

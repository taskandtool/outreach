---
name: cold-email
description: "Writes the subject and opener of each outreach email, in outreach/<slug>.md, from that company's own page. Use after outreach.mjs draft, or when asked to write, rewrite or shorten the emails (\"draft the emails\", \"make the subject punchier\"). Not for sending or approving (PROCESS.md Part 3)."
---

# The subject and opener

Done when each draft's `subject` and `opener` are filled and `node scripts/outreach.mjs check`
passes. The owner then reads `outreach.mjs list` and approves; you never approve or send.

The rest of the email is in the campaign's sequence in Instantly: who we are, the two offers, the
link (`{{page_url}}`), the postal address and the unsubscribe. You add only two lines to each draft.
Put everything particular to this company in them.

Read the company's page (`npm run dev`, then `/<slug>?preview`, so the visit isn't counted) and its
record, `records/<slug>.md`. Then:

- **In the subject, name the business and one true thing about it,** under 60 characters, in their
  words where you can: `Larkspur's 10-year labor guarantee`. Don't write it as if from them, don't
  start it with "Re:", and don't promise what the page doesn't show.
- **The opener is one or two sentences about them:** what their page opens with and why a
  customer would want that first. Example: `We put your 10-year labor guarantee first on the page we built from
  your website.` Use the person's first name only if the draft has one.
- **Use only their facts.** Include a number, a guarantee or an offer only if their page shows it.
  No flattery you can't point to, no "I noticed", no claim about their business you can't see.
- Write plain words the owner would say out loud. The tropes scan in `outreach.mjs check` flags some
  of the rest.

Write them into the draft's front matter, leave `status: draft`, and run the check. Fix what it
finds. If there is nothing true and particular to say about a company, skip its email and tell the owner which company.

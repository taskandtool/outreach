---
name: cross-check
description: "Spot-checks company pages against live sources, and handles a business asking for a change or a takedown. Use before the first emails go out, when asked if the data is right, and for the monthly audit."
---

# Cross-check

Done when what you could fix is fixed and logged, and what needs a person is in one deliverable.

First read the latest `raw/audit/_latest.json` and the `log.md` tail. In the monthly job, stop early
if nothing has changed and nothing is wrong.

1. **Spot-check.** Pick ten companies at random from those `data/pages.json` marks ready. For each,
   open a few facts' `url` and compare: guarantee conditions, whether an offer is current, whose a
   warranty is. A misread is fixed in the record, and if the skill led to it, in the `read-company`
   skill too. An email links this page to its owner, so a wrong fact here costs more than anywhere.
2. **Names.** The `tidy-names` skill's "After a batch".
3. **Report.** One `python3 ~/tools/taskandtool.py post-activity` line for what changed, one
   deliverable for what needs a person (the work skill).

A business asking for a change or a takedown, by reply or any other way: a person decides each. A
correction goes in the record with `corrected: YYYY-MM-DD` on the item, which keeps it through later
reads unless the source changes. A takedown: set the company's `state` to `removed` in
`companies.csv`, rebuild and deploy, and `node scripts/outreach.mjs optout <their address>`. A
business that wants no quote requests gets `no_leads: true` in its record. A picture taken down:
`node scripts/images.mjs hide <company> <file>`, then `images.mjs apply <company>`.

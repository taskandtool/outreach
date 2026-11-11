---
name: tidy-names
description: "Agrees what a niche looks for (fields.yaml) from a sample of companies, and merges names that are one thing (aliases.yaml): two spellings of a brand, two wordings of a service. Use on a new sample, after a batch of companies is read, or when the lists of services, guarantees or brands look messy."
---

# Tidy names

## Starting a niche: `fields.yaml`

Read `SITE.md`, then a handful of different companies in `raw/` (`_index/`, their
warranty, specials and about pages). Propose what this niche actually talks about, in
the words its customers use, as `fields.yaml`:

```yaml
services:
  - replacement: a whole system replaced
guarantee_kinds: [workmanship, parts, labor, satisfaction, price match, on-time]
offer_kinds: [discount, free estimate, financing, seasonal, bundle, referral]
proof_kinds: [award, certification, license, membership, dealer status, press]
details:
  - financing: whether they offer it, and the terms
```

Keep each list short enough to filter on: a dozen services at most, and each thing one
name. Nothing goes in that fewer than two of the companies you read mention. Show the owner, who
edits it. Done when the owner has agreed.

## After a batch: `aliases.yaml`

`node scripts/build-data.mjs` first, then read the names in `data/services.json`,
`data/guarantees.json`, `data/brands.json` and `data/topics.json`. Merge variations, under
`services`, `guarantee_kinds`, `offer_kinds`, `proof_kinds`, `brands` or `keywords`, each
written variation mapped to its one name:

```yaml
brands:
  Northwind Industries: Northwind
  "Corvane Industries": Corvane
```

Separate things that only share a word: a parts warranty is not a labor warranty. Rebuild, and read
the lists again. A kind that keeps landing in `other` goes to the owner for `fields.yaml`, since
changing it means re-reading a sample.

Done when the owner has seen the lists of services, guarantee kinds, offer kinds, brands and phrases, and they make sense.

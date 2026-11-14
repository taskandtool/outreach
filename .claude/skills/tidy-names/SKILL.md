---
name: tidy-names
description: "Drafts `fields.yaml` (what to record for a niche) from a sample of companies for the owner to approve, and merges names that are one thing (aliases.yaml): two spellings of a brand, two wordings of a service. Use on a new sample, after a batch of companies is read, or when the lists of services, guarantees or brands look messy."
---

# Tidy names

## Starting a niche: `fields.yaml`

Done when the owner has agreed to `fields.yaml`.

Read `SITE.md`, then a handful of different companies in `raw/` (`_index/`, their
warranty, specials and about pages). Propose what companies in this niche talk about, in
the words their customers use, as `fields.yaml`:

```yaml
services:
  - replacement: a whole system replaced
guarantee_kinds: [workmanship, parts, labor, satisfaction, price match, on-time]
offer_kinds: [discount, free estimate, financing, seasonal, bundle, referral]
proof_kinds: [award, certification, license, membership, dealer status, press]
details:
  - financing: whether they offer it, and the terms
```

Keep each list short enough to filter on: a dozen services at most, and one name for each
thing. Leave out anything that fewer than two of the companies you read mention. Show the
owner, who edits it.

## After a batch: `aliases.yaml`

Done when the owner has seen the lists of services, guarantee kinds, offer kinds, brands and
phrases, and they make sense.

Run `node scripts/build-data.mjs` first, then read the names in `data/services.json`,
`data/guarantees.json`, `data/brands.json` and `data/topics.json`. Merge variations: under
`services`, `guarantee_kinds`, `offer_kinds`, `proof_kinds`, `brands` or `keywords`, map each
written variation to its one name:

```yaml
brands:
  Northwind Industries: Northwind
  "Corvane Industries": Corvane
```

Keep apart things that only share a word: a parts warranty is not a labor warranty. Rebuild
and read the lists again. If a kind keeps turning up under `other`, ask the owner to add it to
`fields.yaml`. Changing that file means re-reading a sample.

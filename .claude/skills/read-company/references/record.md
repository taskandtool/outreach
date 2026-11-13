# Every field of a record

Read when a company has something the SKILL.md example doesn't show.

| Field | Holds |
|---|---|
| `name` | The company's own name for itself |
| `pitch` | `headline`, `quote`, `url`, and `points`: each `text`, `quote`, `url`. See the skill |
| `no_leads` | `true` when the business asked not to get quote requests. A person sets it; keep it on a re-read |
| `in_niche` | `false` only when it plainly does not do what `SITE.md` says |
| `scope` | `local`, `national` or `online`, when clear |
| `serves`, `serves_evidence` | Places the company names as served, with a quote for them |
| `background` | `summary`, `founded` (a year), `people` (`name`, `role`), `evidence` (quotes) |
| `services` | `name` from `fields.yaml`, `quote`, `url`, and `price` exactly as stated |
| `guarantees` | `kind` from `fields.yaml`, `promise` (what the customer gets, 14 words at most), `length`, `covers`, `conditions`, `whose` (`company` or `manufacturer`), `quote`, `url` |
| `offers` | `kind`, `title`, `ends` (YYYY-MM-DD), `conditions`, `source`, `quote`, `url` |
| `brands` | `name`, `quote`, `url` |
| `proof` | `kind` from `fields.yaml`, `title`, `quote`, `url` |
| `details` | `name` from `fields.yaml`'s details, `value`, `quote`, `url` |
| `keywords` | Phrases that matter here that the company itself uses |
| `testimonials` | `quote`, `who`, `url`: from its own site, chosen by the company |
| `reviews` | `praise`, `complaints`: `theme`, `quote`, `source`, `words` (the words a review of this theme uses, which code counts). `services`: `name`, `words` |
| `media` | `file` under `raw/<company>/`, `kind`, `alt`, `url` of the page it was on |

`source` on an offer is `site`, `facebook_post`, `instagram_post`, `facebook_ad`, `google_ad` or `review`.
`corrected: YYYY-MM-DD` on an item marks what the business itself corrected: it needs no quote, and stays through re-reads.
A kind that isn't listed is `other`; raise it with the owner through `tidy-names`.

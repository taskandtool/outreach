---
name: design
description: "Changes the pages' look: the design record, colours, type and spacing. Use when asked to \"change the look\" or for new colours or fonts, or when \"it looks generic\". Not for how pages work (site) or a company's facts."
---

# Design

Done when `npm run check` passes and the shots from `tt-crawl shoot /<slug>` for two or
three companies look right at both widths: text legible, nothing cut off. Judge the
rendered page, not the code.

The look is one record, `design/system.yaml`. `npm run apply-design` compiles it into
`styles/theme.css`, `DESIGN.md` and `src/fonts.ts`, and refuses a broken record. Read
`DESIGN.md`, then change the record. Never edit the three compiled files. Before you
change the record, read `references/authoring.md` for its fields and rules.

In markup, use only Tailwind utilities made from the tokens: no hex values, no Tailwind
default colours, no custom classes in `styles/`. If the tokens lack a value, add it to the
record. Every company's page has this one look. Don't use a company's own colours yet.

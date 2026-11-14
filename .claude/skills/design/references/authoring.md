# Writing the site's system record

`design/system.yaml` is the site's design system as one record, in the
design library's shape. `npm run apply-design` compiles it into `styles/theme.css`,
`DESIGN.md` and `src/fonts.ts`. No other file holds a design value.

## What the site's record holds

```
id, title, summary          the system's name and one sentence of what it is
identity                    subject, audience, one_job, direction, source, signature,
                            rejection, photography: from the homepage and the owner
tokens                      colors, typography, rounded, shadows, spacing, containers, easing
sections                    overview, colors, typography, components, layout,
                            elevation_and_depth, motion, responsive_behavior,
                            dos_and_donts (do/dont, each {rule, why}), known_gaps
x_invariants                the non-negotiables, split into style and accessible
x_declares                  the design hints this site uses on purpose
x_declares_reasons          one paragraph per declared name
x_imagery                   role, density, treatment, aspect ratios, captions, forbidden,
                            what happens with no photographs
x_emphasis                  how the one figure a page leads on is set
x_motion                    one entrance and one signature gesture, or "still: <why>"
x_layout                    how any band of any page is laid out (below)
```

A record may also have `x_components`: the component recipes used to design
it.

## Tokens: the site's roles

A record from the library can name its colours any way. This site needs them
named by role, because the layout, the components and `styles/input.css`
use these classes on every page. Define every role in the record:
`npm run apply-design` names any role the base stylesheet reads and the
record lacks.

The last column shows how the library's Claret system would map.

| Role | What it is | Claret would map |
|---|---|---|
| `canvas` | the page ground | `cloth` |
| `surface` | a raised card or framed visual | `cloth` |
| `panel` | the alternate band ground | `primary` (blush) |
| `night` | the dark ground: footer, statement bands | `claret` |
| `ink`, `ink-2`, `ink-3` | text on light grounds, three steps | `claret`, then by size |
| `night-ink`, `night-ink-2` | text on night | `cream` |
| `accent`, `accent-ink`, `accent-hover` | the action fill, its text, its hover | `primary`, `claret`, `primary-deep` |
| `line`, `line-strong`, `line-on-night` | hairlines | `line` |

Add a system's extra colours (a star yellow, a second dark) under their own
names, and give each a sentence in `sections.colors`. Typography needs
`display`, `section`, `title`, `lede`, `copy` and `label`; the family of
`display` becomes `font-display`, and the family of `copy` becomes
`font-body`. Spacing needs `section` and `lead`, containers `content` and
`wide`, rounded `control` and `card`. Give a role the system has no use for
the nearest value anyway: the footer and the shared components use it.

## The bar

1. **Take every value from the page the owner liked.** Read
   its template in `src/pages/` and the record's tokens. Keep the colours, sizes,
   radii and spacings the page uses. Drop a token it never uses, except the
   roles above.
2. **Give every rule its reason** (`npm run apply-design` refuses a do or
   don't without its `why`). "Don't use shadows" is a preference. "Don't
   use shadows: depth here is the two paper tones, and a shadow reads as a
   third surface the system does not have" is a rule with its reason.
   With the reason, whoever builds the next page can apply it to a case
   you did not foresee.
3. **Give colour relief, and keep text neutral.** Use a dark or saturated
   ground on about half the bands at most, and put at least one band on the
   opposite value. On a coloured ground, set text in the neutral or in a
   deep shade of the ground's hue at 7:1, dark enough to look like ink.
   Never use a mid tint of the same family. On a dark or coloured ground,
   use the accent as a fill only, never as text.
4. **Write the head as a shot list.** `x_layout.head.statement` says the
   media it needs (subject, orientation, where the subject sits, room left
   for the words), where the words go and how they stay readable, and the
   fallback when there is no such picture.
5. **Always say how imagery and motion work.** `x_imagery` says what role
   pictures play and what happens with none. `x_motion` is one entrance and
   one gesture, or `principle: "still: <why>"` and `reduced`.
6. **Keep type above its floors.** Body text at least 18px; section heads
   at least 2.5 times the body.
7. **Write every reference as `{group.name}`** (`{colors.night}`,
   `{typography.title}`, `{spacing.section}`). `npm run apply-design` rejects
   one that does not resolve.

## x_layout: how bands look

`x_layout` says how a band of a given shape and count looks in this system.
It names no page type and says nothing about what goes where. That belongs
in the page's brief.

```yaml
x_layout:
  measure: { reading: "<ch, type token>", caption: "<ch>" }
  grid: { columns: 12, container: "", gutter: "", text_columns: "", media_columns: "" }
  rhythm: { section: "", group: "", item: "", element: "", separator: "space | rule | surface: how" }
  registers:   # by page mode
    persuasion: { head: statement, type: "", rhythm: "" }
    retrieval:  { head: plain, type: "", rhythm: "one step denser" }
    reading:    { head: plain, type: "", rhythm: "one column at measure.reading" }
  head: { statement: "", plain: "" }
  close: "the band that makes the page's last ask"
  shapes:      # each: as · look · counts (the arrangement for each number of items)
    items: {}  table: {}  facts: {}  qa: {}  people: {}  sequence: {}
    media_text: {}  gallery: {}  quote: {}  prose: {}  form: {}  index: {}
  focal: "what leads each band, and how the rest steps down"
  never: ["<a layout don't: why>"]
```

Plan for counts. Six services, forty menu items and four people must each
come out right. For a count that divides badly (four people in three
columns), say what to do instead.

## A worked example: the identity

The identity, filled, for a made-up business (a cabinetry workshop):

```text
Subject:            Fitted kitchens and wardrobes, made and installed by Harlow Joinery
Audience:           Homeowners in Bristol renovating a kitchen, comparing three or four makers
One job:            Get a workshop visit booked
Direction:          Poster on a wall: the work said plainly, in heavy type, with black edges
Source:             The workshop's own job sheets and the hand-lettered boards outside it
Signature:          The hero block on a hard shadow with the giant word MADE in its foot
Rejection:          The kitchen-showroom site: soft photos, a centred slogan, three cards of services
Photography:        Three finished kitchens from this year
```

Everything on the page follows from those lines: the h1 is the owner's
claim in their words, the process is four rows because there are four
steps, and the one motion is the button press. An identity that says
"premium" or "modern" needs rewriting.

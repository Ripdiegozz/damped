# damped brand

The mark is the phase portrait of a damped oscillator: an even-weight spiral that winds in and stops clear of a separate rest dot. Position and velocity spiral toward rest, and the dot is where the motion comes to rest. That is also the library's core idea.

## Files

| Path | What it is |
| --- | --- |
| `mark.ts` | The geometry: both cuts as parameters, laid out on a 32 grid. |
| `wordmark.ts`, `lockup.ts` | Geist outlined to paths (no font at runtime) and the mark plus word lockup. |
| `svg.ts`, `og.ts` | SVG composition for the mark, the tile, the lockups and the social card. |
| `tokens.css` | Colours, the single source for the generator and the docs theme. |
| `mark.svg`, `mark-small.svg` | The two cuts with `currentColor` ink and the accent dot. Generated. |

## Cuts

- **Master** (`mark.svg`): 32 px and up. Stroke 3.5, dot 2.4, 0.78 turn.
- **Small** (`mark-small.svg`, used for the favicon): 16 to 32 px. Heavier stroke (4.0), bigger dot (2.8) and a shorter run (0.62 turn) so the gap to the dot stays open at 16 px.

## Colour roles

- The spiral and the wordmark take the **ink**: `#ededed` on `#0a0a0b`, `#0a0a0b` on `#fafaf9`.
- The rest dot is the **only** accent element: `#ff5f1f`, in both themes and in every lockup.
- Accent as text uses `--damped-accent-text-dark` or `--damped-accent-text-light`, which clear 4.5:1 on their surface.
- The favicon is a near-black rounded tile with light ink, so it works in light and dark browser chrome without a media query.

## Clear space and minimum sizes

- Keep clear space of half the mark's height on every side of the mark or lockup.
- Mark: never below 16 px (use the small cut up to 32 px). Lockup: never below 96 px wide.

## Do and don't

- Do use the supplied files; never retype the wordmark or redraw the spiral.
- Do keep the dot a different colour from the spiral and detached from it.
- Don't recolour the spiral with the accent, add a second accent element, rotate or mirror the mark, outline it, add shadows or gradients, or stretch it.

## Regenerating

`bun run brand` writes every derived asset (favicons, touch icons, web manifest icons, social card, docs logos, README lockups) from these sources. The generated files are committed, and `test/brand-assets.test.ts` fails with the list of drifted paths when they differ from the generator.

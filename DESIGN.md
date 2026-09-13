# Anteiku design system

Read this before touching anything visual. It exists because the defaults a
generator reaches for are recognisable, and this app hit six of them at once:
an indigo to violet accent, permanent dark mode, gradients on every surface,
coloured glows, frosted glass chrome, and all caps labels on every section.

The look we want is the one in the game covers: bright, flat, roomy, soft
shapes, one confident colour per thing. Playful, not toy.

## Ground rules

**Light is the default.** Dark is a real theme, not the identity. The paper is
warm off white, never pure white, never the neutral grey every dashboard uses.

**Colour identifies, it does not decorate.** Each area of the app owns one
vivid hue, taken from the covers. Search is coral, rooms are azure, games are
violet, friends are emerald, profile is amber. A screen shows its own hue and
almost nothing else. There is no single global accent tinting every control.

**Actions are ink, not colour.** The primary button is near black on paper and
paper on near black. Colour marks what a thing *is*; contrast marks what you
can *press*. This keeps the bright palette from turning into noise, and it is
why a screen can be colourful and still calm.

**Sentence case.** No `uppercase` and no letter spaced micro labels. They read
as a template. Section headers are plain sentence case at a normal size.

**No gradients on surfaces.** Panels, bars, headers and cards are flat fills.
Gradients live inside illustrations only, where they are drawn, not applied.

**No glows.** No coloured box shadows, no `0 0 20px accent`. Elevation is a
soft neutral shadow, low and short. If something needs emphasis, give it a
solid fill or more space, not a halo.

**No frosted glass.** `backdrop-blur` on chrome is a tell and it costs frames
on a mid range phone. Bars are solid.

**Space is the main tool.** When a screen feels cluttered the fix is fewer
things and more room, not smaller type or thinner dividers.

## Tokens

Neutrals carry a trace of warmth so the paper never goes clinical.

| token | light | dark |
| --- | --- | --- |
| `--paper` | `oklch(0.986 0.005 85)` | `oklch(0.17 0.012 265)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.225 0.014 265)` |
| `--ink` | `oklch(0.22 0.02 265)` | `oklch(0.97 0.005 265)` |
| `--ink-soft` | `oklch(0.48 0.018 265)` | `oklch(0.74 0.014 265)` |
| `--ink-faint` | `oklch(0.62 0.014 265)` | `oklch(0.60 0.014 265)` |
| `--line` | `oklch(0.22 0.02 265 / 0.09)` | `oklch(1 0 0 / 0.09)` |

Section hues, the same five the covers use:

| area | hue | chroma |
| --- | --- | --- |
| search | 28 (coral) | 0.17 |
| rooms | 245 (azure) | 0.16 |
| games | 292 (violet) | 0.17 |
| friends | 158 (emerald) | 0.14 |
| profile | 62 (amber) | 0.15 |

Each resolves to `--hue-solid` for fills, `--hue-wash` for a tinted block, and
`--hue-ink` for text on the wash. Never use a hue for body text.

## Type

Montserrat throughout. It is not Inter, Geist or Space Grotesk, and it does not
need a serif italic accent word to look considered.

| role | size | weight |
| --- | --- | --- |
| screen title | 26 | 800 |
| section title | 17 | 700 |
| body | 15 | 400 |
| secondary | 13.5 | 400 |
| meta | 12 | 600 |

Numbers use `font-variant-numeric: tabular-nums` wherever they change.

## Shape and depth

Radii: 14 for controls, 20 for cards, 28 for hero blocks, full for pills and
avatars. One shadow only, `0 1px 2px ink/6%, 0 8px 20px -12px ink/18%`, and
plenty of surfaces carry none at all.

## Motion

Enter with a 12px rise and a fade over 260ms on `cubic-bezier(0.23, 1, 0.32, 1)`.
Press is `scale(0.97)` on a stiff spring. Nothing bounces on hover, nothing
pulses for attention. A list staggers by 35ms and stops after the sixth item.

## Layout

One screen, one job. The primary action is the largest thing on it and sits
where a thumb rests. Secondary destinations are cards with a name and a line
that says what happens, not a row of identical icons.

If a screen needs more than five tap targets above the fold, it is two screens.

## Acceptance check

Before calling a screen done:

1. Would the main action be obvious with the labels removed?
2. Is there any uppercase label left?
3. Any gradient, glow or blur on a surface?
4. Does body text pass AA on its own background, measured not guessed?
5. Does it hold together in both themes?
6. Does anything bounce, pulse or shimmer without being asked?

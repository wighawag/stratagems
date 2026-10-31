# PROTOTYPE, throwaway: stratagems on a Go board (pixi.js 8.22.0, three.js 0.186.1)

Branch `proto/go-style`, never merged. The question it answers: **how should a stratagems cell show its life (0 to 7) and its trend (+1 or -1 each cycle) without printing a number, and who owns it**, on a Go-like board rendered with pixi.js, so step 9 can be specified. Decided by the user on 2026-10-30: the twgl.js "world" renderer of `specify-9` is deferred; this replaces it.

Run it (port 5199, checked free with `ss -ltn` first):

```sh
cd ~/dev/worktrees/stratagems/proto/go-style/prototypes/go-style && pnpm install --ignore-workspace && pnpm dev
```

then open http://127.0.0.1:5199/. Screenshots: `pnpm shots` (with the dev server up) writes `shots/*.png` from headless Chromium.

- Variants (left/right arrows or the bottom bar): **A** a dial of seven marks round the rim, filled up to life, giving way to the stone's size at far zoom; **B** the stone's size only; **C** cracks for damage (7 minus life), no dial.
- Trend, in every variant: growing is a soft light ring (and in A its next mark pulses; in B a dashed ring at the next size), shrinking a red rim (and in A the mark about to empty flickers). Turn the cycle (T) to see marks fill or empty, sizes change, cracks heal or spread, and a dying stone crack and fade.
- Bridges and notches (B): a bold bridge joins two same-colour neighbours along their grid line; a red pinch marks an enemy contact. The rule is then read from the picture: more bridges than pinches, or no pinch, and it grows.
- Ownership: hover a stone to light its owner's cells and dim the rest, tap to pin (card: blockie, short address, cells, gems at stake); Owners overlay (O) draws each owner's blockie as an inlay at close zoom; outlines (G) draws each owner's connected groups.
- Dead cells STAY (the contract never clears a dead cell's colour, and it keeps counting as a friend or an enemy for its neighbours until someone places on it): drawn as a flat, sunken, cracked husk of its colour, with its bridges and notches still drawn. A dying stone cracks at the turn and sinks into a husk.
- Evil is a colour like the others (placed at life 2 by a collision, same life rule, Evil cells are each other's friends): a flat charcoal stone with the same dial, in bone-coloured pips.
- Other markers: your own stones have a centre dot; a planned placement is a ghost, a planned removal a cross; a cell holding more gems is a thicker stone (one seam per extra gem).

The rule functions are in `src/rules.ts` (pure, what a real step would unit-test); every texture is drawn in code in `src/textures.ts`.

## Round 2 (2026-10-30, after the user's review of round 1)

Kept from round 1: bridges and notches, the dial when zoomed in and size when zoomed out. Dropped: cracks as the life display, the blockie inlays and the per-owner outlines (unbounded players). New:

- **Four looks** (left/right or the panel): Flat (round 1); Rich 2D (a procedural straight-grained wood board with hoshi every 8 intersections, gems drawn as cabochons with a table ring, the one the Evil stone had, in deeper jewel tones of the same hues); Baked (the gem modelled in three.js and rendered once per colour into the pixi sprite); Live 3D (three.js, physically based, instanced, with a tilt).
- **One pulse**: only the pending pip pulses, gold where life is coming and red where it is going, every gem in step; the glow and the red rim are steady.
- **Your gems sit in a gold bezel** (four prongs), visible at every zoom; the white dot is gone.
- **Stacks are Evil only**: a normal cell's stake is always 1 (`_placeColor`); a collision makes Evil with one gem per colliding player. The stack is drawn one disc per gem, and hovering it lists the players (from the indexer's 7-cycle placement window, in a real build) and what killing it pays.
- **Hover without flicker**: the hit area is the cell's whole square (no gap between neighbours), and leaving to empty board keeps the highlight 250 ms.
- **A real crack**: cracks race out from an impact point, the gem shudders, chips fly, then it sinks into its husk.
- **Faction territory outlines** (G): each connected living group of one colour, outlined in its colour.

## Round 3 (2026-10-30, after the user's review of round 2)

`pnpm dev` as before; screenshots with `node shots-r3.mjs [url] [filter]`. New switches in the panel (and URL params): `style=jewel|yunzi|lacquer`, `board=kaya|slate|washi|felt`, `mine=halo|bezel|tile`, `tilt`, `az`.

- **Gems that sit with the wood**: besides round 2's jewel, `yunzi` (the satin, softly translucent stone of Go's yunzi stones, muted tones of the same hues, one broad soft highlight) and `lacquer` (deep urushi lacquer, a window reflection, a fine gold rim, a gold table ring and gold pips). Every style keeps the table ring.
- **Boards**: kaya (wood), slate, washi (paper), felt, with line ink to match.
- **Yours**: `halo` (an ivory ring with a black edge, on the board around the gem; the default), `bezel` (round 2's, heavier and outlined), `tile` (the gem on a light plinth). The halo and the plinth keep full size at far zoom.
- **Live 3D, redone**: a perspective camera that tilts (Y) and turns (Q/E), real shadows, a warm key light low from the upper left and a cool rim light, a taller dome, and each gem style as a material (lacquer with real gold). **Round 2's 3D (and its baked sprites) looked flat because of a bug of mine**: the lathe profile was given top-down, so every face of the gem pointed inward and the dome was culled; fixed here (`pts.reverse()`), which also fixes the baked look.
- **Territory**: the outlines (which ran between the Go lines) are replaced by a wash of each faction's colour under its living cells. Still faint.

## Round 4 (2026-10-30)

The user's favourite: rich 2D, jewel gems, kaya wood, a bezel for their own gems; these are now the defaults. New: the bezel's metal (`metal=gold|rose|platinum|bronze|gunmetal|ivory|onyx|ruby`, the "in" selector), screenshots with `node shots-r4.mjs`. Live 3D's lighting does not work (the user) and is parked; the territory wash is kept.

Round 5 (2026-10-31): the white rings were too much (the user). The growing glow is narrower and half as strong, and the hovered owner's ring is a fine line hugging the rim; `shots/r5-halo-before-after.png`.

Round 6 (2026-10-31): yours when zoomed out. The gold bezel is kept close up; below 48 px per intersection it gives way to `minefar=ring` (a plain bright ring of fixed screen width), `wash` (a gold territory wash under your gems) or `ivory` (the same in ivory). `shots/r6-mine-by-zoom.png`, `shots/r6-yours-far.png`.

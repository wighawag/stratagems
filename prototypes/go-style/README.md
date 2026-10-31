# PROTOTYPE, throwaway: stratagems on a Go board (pixi.js 8.22.0)

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

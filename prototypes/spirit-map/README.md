# PROTOTYPE, throwaway: stratagems as a low-poly map of spirits (three.js 0.186.1)

Branch `proto/spirit-map`, never merged. The question: **can the board's exact information (colour, life 0 to 7, trend, friends and enemies, dead husks, Evil and its stake, yours, planned moves) read as a map** (sea, biomes, volcanoes, spirits fighting) rendered in low-poly three.js, on mobile, up to 20,000 cells, so the world players make is a map other games can build on.

Run it:

```sh
cd ~/dev/worktrees/stratagems/proto/spirit-map/prototypes/spirit-map && pnpm install --ignore-workspace && pnpm dev
```

then open http://100.71.110.44:5198/ (bound to the tailscale address, so a phone on the tailnet can open it). Screenshots: `node shots.mjs [base-url] [filter]` writes `shots/*.png` from headless Chromium (software GL, so its fps numbers mean nothing).

## The mapping (agreed 2026-11-16)

| Board | Map |
|---|---|
| empty | the sea (low-poly waves, see-through shallows) |
| Blue, Red, Green, Yellow, Purple | Glacier, Mesa, Forest, Plains, Mountains, in the legacy hues |
| Evil | volcano; its stake (one gem per colliding player) is one smoke plume per gem and a wider crater |
| life | far: how big and high the land is and how many props (one tree, shard, cactus... per point of life). Close: a ring of 7 standing stones, lit up to the life the cell keeps |
| trend | the pending stone pulses gold (coming) or red (going); motes rise where life grows, embers fall where it goes |
| dead (stays, still counts) | a grey husk of its biome, two husk props, no spirit |
| friends | land merges across the edge |
| enemies | each living spirit sends bolts at every enemy edge, sparks where they land; in A the edge is a scorched rift |
| yours | a banner |
| planned placement / removal | a translucent ghost block and spirit / a red cross |

## Variants (bottom bar, arrow keys, `?variant=`)

- **A, Continent**: one blended heightfield (`src/continent.ts`). Same-colour neighbours merge into one landmass, a lone cell is a round island whose size follows its life, empty cells are seabed so coasts and lakes come for free, enemy edges are rifts. Mesa terraces, snowy peaks, ice domes and craters are relief. Detail is 2, 3 or 4 vertices per cell (`?res=`).
- **B, Diorama**: a pillar of land per cell (`src/diorama.ts`) with its biome's feature on top, bridges between friends, a 2x2 fill, sea channels between enemies. Reads more like a board.

## Switches

Scene (`showcase` every state laid out, `skirmish` 1,165 cells, `stress` about 24,000 cells), layer toggles (props, stones, spirits, motes, attacks, banners), Turn (T, animated: land rises, sinks), auto turns, free camera (F: orbit; fixed tilted map view by default), shadows, and look / place / remove to plan moves by clicking. URL: `x`, `z`, `d` (camera), `az`, `polar` (free camera).

## Budget

Everything is chunked by 16x16 cells so the camera culls, and the details thin out by distance (`LOD` in `src/overlays.ts`): stones under 15 units, props, motes and attacks under 34, spirits under 60. At the 20k overview only terrain and sea draw: A at res 3 is about 550k triangles, B about 1.6M (B is the more expensive at a distance). Real phone numbers are still to measure.

## Round 2 (2026-11-16, after the user's review of round 1)

Round 1's animations were cool but too much repeated everywhere (the user). Now **calm** by default (`lively` in the panel, or `?lively=1`, brings round 1's loops back):

- At a turn (T), every living spirit fires ONE volley at its enemy edges (bolts, sparks where they land), then the land changes, then motes rise once where life came, embers fall where it went, dust where a cell died (`src/events.ts`). Between turns nothing loops but the ambient: the volcano's smoke (thinner, slower) and crater glow.
- The focused cell (hover, or tap on a phone) shows its fights, in and out, looping while it is focused.
- Spirits bob and turn slower and less, their glow no longer pulses; the pending standing stone pulses slower and softer.

**Map only** (`?map=1`): the map alone, for a game built on top of the world that does not need stratagems' information. No spirits, standing stones, banners, fights, motes or planned moves, no card. Land, biomes, props, dead husks and volcanoes stay. **Hide life** (`?uniform=1`, with map only): every living cell drawn alike (as life 5, one gem), so neither life nor stake shows; dead cells stay as wasteland.

Screenshots: `node shots-r2.mjs` (`shots/r2-*.png`).

## Round 3 (2026-11-16)

The attacks were hard to see, growth against shrinkage could be clearer, and your cells too (the user):

- **Fights**: a red seam on every edge between two colours, always there, so the fronts read at a glance without any animation (`fronts`). The volley's bolts are comets (a bright head, five trailing points), twice the size, and land in a big white and red flash.
- **Growing or shrinking**: a gold arrow up or a red arrow down above every spirit whose life will change (`arrows`), visible as far as the spirits are; the stones stay for the exact count close up.
- **Yours**: an ivory wash on your land at every zoom (the Go board's choice, `wash`), a gold border just inside the edge of your territory (`border`), and bigger banners.

Screenshots: `node shots-r3.mjs`; it pins the shader clock (`window.timeOverride`) to catch the volley in flight.

## Round 4 (2026-11-17)

- The ivory wash was too pale (the user): your land keeps its biome's colour. `wash` (off by default, `?wash=1`) now only brightens it a touch, same hue.
- **The gold border is the mark of your territory**: a ribbon lying on the ground just inside its edge, following the terrain (sampled every 0.12 of a cell, so no steps), never below the sea, square caps at its ends, and widened in the shader as the camera pulls back so it stays a line you can see. Round 3's flat pieces stepped and overlapped on slopes; a line drawn over everything at one height slid against the land with the camera (parallax) and was dimmed by the sea drawn after it.

Screenshots: `node shots-r3.mjs` (`r4-*`: borders in the mountains).

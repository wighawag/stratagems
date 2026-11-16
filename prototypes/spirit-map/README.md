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

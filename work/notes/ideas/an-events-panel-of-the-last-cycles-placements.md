---
title: An events panel of the last cycle's placements
type: idea
status: incubating
created: 2026-10-26
---

# An events panel of the last cycle's placements

The legacy app had an events list (`web/src/lib/stratagems/ui/events/`, deleted in step 6c of `work/plans/join-template-commit-reveal.md`; read it at that step's parent commit, 54cafc4d) showing what each player placed in recent epochs. Step 6c dropped it rather than port it (P4, the user's choice, 2026-10-26), because nothing else in the HUD needed it and it was one more panel to carry through the renderer step.

The data is already there: the indexer holds `placements` (newest first, at most 7 cycles, per cell the players and colours that placed on it), in `Data.placements` of `stratagems-indexer`. A HUD panel would be a pure derivation from `game`'s board store, in the shape of `web/src/lib/stratagems/leaderboard.ts`, plus a runes-mode component beside the others in `web/src/lib/stratagems/hud/`. What it would add: after a reveal, a player sees who moved where, collisions included, which the board alone shows only as a result.

Worth doing once the renderer (step 9) can highlight a cell the panel names; before that, a list of coordinates is hard to read.

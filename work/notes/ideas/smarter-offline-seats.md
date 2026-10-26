---
title: Smarter offline seats
type: idea
status: incubating
created: 2026-10-26
---

# Smarter offline seats

The seats stratagems' offline world plays (`web/src/lib/offline-players.ts`, P6 of step O in `work/plans/join-template-commit-reveal.md`) place one gem a cycle on a cell derived from the game, the seat and the cycle, in their default colour, never read the board and never remove. The contract judges legality, so they cannot break anything, and they hold nothing in memory, which is what keeps a world from freezing on reload. The user, deciding P6 on 2026-10-26: one placement a turn for now; the seats should get smarter later. Whatever replaces the derivation must keep that property (a turn rebuilt after a reload is the turn committed) or carry its secret somewhere a reload finds it, and the template's file calls that "the NPCs a later phase wants", so the home test is worth asking first.

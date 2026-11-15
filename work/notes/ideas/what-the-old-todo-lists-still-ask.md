---
title: What the old TODO lists still ask
type: idea
status: incubating
created: 2026-11-15
---

# What the old TODO lists still ask

`TODO.md` and `web/TODO.md` were the legacy app's lists, from before stratagems joined the template tree. Step C2 of `work/plans/join-template-commit-reveal.md` deleted both (C-9), after reading them item by item; they are at the tag `alpha1-final` and in the history before that step. Most of their items are done or were about code that is gone: winnings and withdrawals are in the HUD, the cell panel shows a cell's owner and state, the local wallet is the template's, the indexer is the framework's host, the CSS is the template's, and the twgl.js renderer, the metamask edge cases of `web3-connection`, the degit home page and `data/networks.json` all left in steps 6c and 9.

Four items are still true of the app as it is, each a candidate of its own:

- **A warning before a phase ends.** "Show warning for x minutes left to commit" and "to reveal": the HUD shows the clock, but nothing calls attention to a commit phase about to close on a planned, uncommitted turn. Every commit-reveal game could want it, so the template's HUD is the first home to test.
- **What happened since the last visit.** "Show your winnings as event", "show your loss as event", "show events since last time": a player who comes back after some cycles sees the board, not what it did to their cells. It extends `an-events-panel-of-the-last-cycles-placements.md` from the last cycle to the cycles since the player's last visit.
- **A view mode when zoomed out.** "Zoom out show color for better clarity" and "show mode switch => color / player / life / dead / gaining / losing": the pixi board (step 9) draws one style at every zoom.
- **Chat.** "Add public chat" and "add one-to-one chat": the legacy app had missiv, which left in step 6c; nothing replaced it.

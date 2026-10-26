---
title: A guided tour of the HUD
type: idea
status: incubating
created: 2026-10-26
---

# A guided tour of the HUD

The legacy app had a driver.js tour (`web/src/lib/stratagems/ui/tour/`, deleted with `driver.js` in step 6c of `work/plans/join-template-commit-reveal.md`; at that step's parent commit, 54cafc4d) that walked a player through its panels. Step 6c dropped it (P4, the user's choice, 2026-10-26) because every panel it pointed at was replaced: the HUD is now the template's with stratagems' panels beside it.

A tour of the new HUD would point at the clock, the plan and commit controls, the faction picker, the cell panel and the stake. Its anchors would be the `data-testid`s the e2e already uses. It is the kind of thing every game on the template could want, so the home test comes first: a framework tour that a game feeds with its steps, rather than a stratagems copy.

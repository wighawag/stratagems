---
title: The HUD's "who reveals" wording lives in the reference game's HUD, not in the fuzd layer, so every game copies it
type: observation
status: spotted
spotted: 2026-10-30
relates-to: work/plans/join-template-commit-reveal.md (step 8, item 6); template-commit-reveal `with/fuzd` (`work:work/tasks/done/with-fuzd.md`)
---

# `describeRevealSchedule` is the reference game's, so stratagems has a copy

`with/fuzd` gives a game everything to compose a scheduled reveal from `$lib/fuzd` (the scheduler, the mode, `FuzdExtensions`, `scheduledTurn`, `createScheduledReveal`, `revealOnScheduleFailure`), but the function that turns a `ScheduledReveal` and the submission into the HUD's line (`describeRevealSchedule`: scheduled, broadcast, confirmed, failed, unreachable, not scheduled, and when to say nothing) is in the reference game's `web/src/lib/placement/ui/hud.ts`. A game omits that game, so step 8 wrote it again in `web/src/lib/stratagems/hud/hud.ts`, word for word, with its own test (`web/test/lib/stratagems/hud-reveal-schedule.test.ts`); the HUD comment beside it says why.

Nothing in it is the reference game's: it reads only the layer's `ScheduledReveal` and the framework's `SubmissionState`, whatever the action. Its home is `$lib/fuzd` (typed over the action, the model's `revealSchedule` shape exported beside it), where every game that adopts the layer would import it and the wording would cascade instead of diverging by copy. A template change, so it is the template's to do; stratagems' copy then goes in the next cascade.

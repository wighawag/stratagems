---
title: Cancel a scheduled reveal when its commitment is cancelled
type: idea
status: incubating
created: 2026-10-30
---

# Cancel a scheduled reveal when its commitment is cancelled

With fuzd configured (`with/fuzd`, step 8 of `work/plans/join-template-commit-reveal.md`), a committed turn's reveal is scheduled with fuzd as one batch, `fixed-time` at `revealDueAt`, paid for by the commit (the remote account's `paymentReserve`). If the player then cancels the commitment in the commit phase (`CommitmentCancelled`), the schedule stays: it fires in the reveal phase, reverts (there is no commitment left to open), and costs one transaction's gas from what the player prepaid. P11 of step 8 left this as an idea unless the server already supported cancelling.

**It does not.** Measured by template-commit-reveal's item-5 session (`work:work/tasks/done/with-fuzd.md` there): no route of `@fuzd/server` 0.12.1 cancels a schedule; `deleteExecution` exists in its storage interface only. Two adjacent facts from the same measurement: a new schedule into a slot still queued REPLACES it, and a schedule into a slot already broadcast is accepted and never sent (a fuzd backlog task, `reject-a-schedule-into-a-spent-slot.md`).

Shape, when it is wanted: a signed `DELETE` (or `cancel`) route in `@fuzd/server` for one `(chainId, account, slot)` while it is still queued, `@fuzd/client` exposing it, and the scheduler seam (`RevealScheduler`) gaining an optional `cancel` that the submission calls after a cancelled commitment lands; the HUD's line then says the reveal was unscheduled. Its homes are fuzd first (the route, a release), then template-commit-reveal `with/fuzd` (the seam and the layer), then a cascade; nothing of it is stratagems'. The cheaper alternative, scheduling a replacement no-op into the same queued slot (which fuzd replaces), still costs a transaction and is a trick rather than a route. Worth it once cancelling is common enough that the reverted reveal's gas matters; today it is one transaction from a prepaid balance.

---
title: The committed turn is written durably only BEFORE the commit, so a tab closed just after it loses the committed record
type: observation
status: spotted
spotted: 2026-10-30
relates-to: work/plans/join-template-commit-reveal.md (step 8, "Done when"); template-commit-reveal `main` web/src/lib/game/core/submission.ts (`commit`), web/src/lib/game/core/commit-reveal/storage.ts
---

# A tab closed right after a commit can lose the committed turn

**Measured** by step 8's `e2e/tests/stratagems-fuzd.e2e.ts`, which commits, waits for the HUD to say "Scheduled: this turn will be revealed for you, even if you close this page.", and closes the tab. Probed just before `page.close()`, the account data in `localStorage` (`__private__31337_<account>...`): in two passing runs it held the turn twice as `"committed":true` (the plan slot and `committedTurns`); in the failing run it held it once as `"committed":false` and no committed turn. The new page opened after the cycle then found the slot at `{turn: null}` (it dropped the "uncommitted plan" of an earlier cycle) and `committedTurns` empty, so it showed `Idle`, though fuzd had revealed the turn from the remote account. About one full e2e run in three after the race fix (`a-restored-turn-keeps-its-record-until-the-chain-answers.md` on template-commit-reveal's `work`), which did not cause this and does not prevent it.

**The mechanism** (template-commit-reveal `main` f8623416): `commit()` writes the record DURABLY before sending (`saveDurably`, `committed: false`, the secret and the hash), as the file comment requires. Once the commitment is on chain it writes the committed record (`committed: true`, `revealScheduled`, the layers' `extensions`, and, in the account-data storage, the `committedTurns` entry written once) with a plain `storage.save`, which goes through synqable's local-storage debounce (100 ms by default) and an asynchronous save, and then sets `Committed` at once. A tab closed in that window keeps only the pre-commit record.

**What it costs a player**, beyond the e2e:

- with a scheduler: a turn fuzd revealed is reported `Idle` on the next page instead of `Revealed` (the HUD invites exactly this close);
- without one, a missed reveal: the next load in a later cycle drops the record as an uncommitted plan, and with no `committedTurns` entry the missed-reveal settlement cannot be shown the chunks, so the WHOLE bond is forfeited instead of one gem a move (the framework's own reason for keeping committed turns);
- the fuzd schedule (`extensions.fuzd`) is lost with it, so the HUD's status line has nothing to read.

**Its home is template-commit-reveal `main`** (the submission and its storage are the framework's), then the cascade. The obvious shape: write the committed record durably (`saveDurably`) before reporting `Committed`, as the pre-commit record is; a failed durable write must not undo a commitment that is on chain (the secret is already durable), so it is reported, not thrown. Its unit test: a storage whose `saveDurably` is held, and `Committed` not reported, nor `committedTurns` missing on a "reload", until it resolves.

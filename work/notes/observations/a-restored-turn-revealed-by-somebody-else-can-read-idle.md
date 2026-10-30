---
title: A turn revealed by somebody else, restored on a new page, can read Idle for good when the context is left while the chain is asked
type: observation
status: spotted
spotted: 2026-10-30
relates-to: work/plans/join-template-commit-reveal.md (step 8, "Done when"); template-commit-reveal `main` web/src/lib/game/core/submission.ts (item 4, `the-submission-in-the-account-data.md`)
---

# `closeEarlierTurn` loses its answer to `leaveContext`

Found by step 8's `e2e/tests/stratagems-fuzd.e2e.ts`: fuzd revealed the turn (the chain says so, from the remote account), and the new page opened after the cycle turned showed the submission `Idle` for 90 s instead of `Revealed` (missed-reveal `Clear`, so nothing was lost but the report). One failure in five full e2e runs of the final suite (52 to 54 tests, `E2E_RPC_PORT=8555 E2E_PORT=4183`), none in the fuzd stages run alone; a run instrumented every 150 ms shows the identity and the account data's `ready` arriving within one poll on the new page, then `Revealed` a few hundred ms later, which is the window.

**The mechanism, in the framework's byte-identical `game/core/submission.ts`**: `restore()` finds an earlier cycle's committed record and calls `closeEarlierTurn`, which CLEARS the stored record at once, sets `Idle`, and asks the chain (`commitmentStatus`), then awaits `onSettled` (the board's update), and writes `Revealed` only if `generation` has not moved and the state is still `Idle`. `leaveContext()` moves `generation`, and it runs whenever the storage's readiness goes false (the account data reloading) or the identity changes, including a flicker (`undefined` then the same account). After it, `restore()` runs again on a record that is already gone, so nothing is restored, and the in-flight answer is dropped: `Idle` for good.

**Reproduced deterministically** with a scratch unit test against `createSubmission` (not committed, the framework is not stratagems' to change): a stored committed turn of cycle 2, the clock in cycle 3, `commitmentStatus` held open; then either `ready` false then true, or the identity `undefined` then the same player; then the chain answers `revealed`. Both end `{"step":"Idle"}` with the record cleared; the control (nothing in between) ends `Revealed`. The test body, for the template session:

```ts
const {cycleInfo} = fakeCycles(50); // cycle 3; the record is cycle 2's
const who = writable<`0x${string}` | undefined>(player);
const ready = writable(true);
const base = fakeStorage<Action>();
base.save({cycleNumber: 2, actions: [{cellID: 1n}], secret: '0x01', committed: true});
const storage = {...base, load: () => base.load(), save: base.save, clear: base.clear, ready: {subscribe: ready.subscribe}};
let answer!: (s: CommitmentStatus) => void;
const adapter = {...fakeAdapter().adapter, commitmentStatus: () => new Promise<CommitmentStatus>((r) => (answer = r))};
const submission = createSubmission({cycleInfo, adapter, storage, identity: who});
const stop = submission.start();
await new Promise((r) => setTimeout(r, 0));
ready.set(false); ready.set(true); // or: who.set(undefined); who.set(player);
answer('revealed');
await new Promise((r) => setTimeout(r, 20));
expect(submission.value).toEqual({step: 'Revealed', cycleNumber: 2}); // is {step: 'Idle'}
```

**Its home is template-commit-reveal `main`** (the submission is the framework's, item 4's code), then the cascade to `with/fuzd` and stratagems. Candidate fixes, for that session to choose: clear the record only once the chain has answered (so a restore after `leaveContext` finds it again and asks again), or let the answer land when the context it was asked for (identity, cycle) is still the current one rather than when `generation` is unchanged. Any game is exposed whenever a third party reveals: fuzd, a friend, or the fallback of another tab.

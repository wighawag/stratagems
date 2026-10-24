# setup

`pnpm i`

# frontend

in ./web
for typescript checks: `pnpm check`
for tests: `pnpm test`

## Svelte conventions

- **`.svelte` files must be logic-less or logic-minimal.** They should only
  render UI and wire props/stores together. Small presentational conveniences
  are fine (a display formatter, a class toggle, a UI-only animation, local
  open/closed modal state). Anything else, business/domain logic, async
  blockchain calls, transaction building, balance checks, data
  fetching/derivation, non-trivial computation, filtering/sorting/aggregating
  domain data, network error handling, belongs in a plain `.ts` module (a
  helper, a store, or a service) that the component imports.

- **Never create `.svelte.ts` files.** Do not use Svelte runes
  (`$state`, `$derived`, `$effect`, ...) outside of `.svelte` components. Put
  reusable logic in plain `.ts` files and expose reactivity with Svelte stores
  (`writable`/`readable`/`derived` from `svelte/store`). Components consume
  those stores with the `$store` syntax and own any `$effect`/lifecycle wiring
  themselves.

- Logic lives in `.ts`, reactivity crosses the boundary as stores. Prefer
  factory functions that return `{subscribe, ...actions}` (see the existing
  stores under `src/lib/**` and `src/routes/**/lib/stores/`).

## The framework boundary

- **Only `web/src/lib/kit` may import `$app/*`.** Everything under `web/src/lib/core` takes what it needs from the framework as a parameter (`PathResolver`, `ServiceWorkerEnvironment`), and `web/src/routes/**` is exempt because routes are the framework's own surface. `web/test/framework-boundary.test.ts` enforces this and `web/src/lib/kit/README.md` states the scope, including what the rule deliberately does not cover.

- **`web/src/lib/index.ts` is where the app is composed**, which is why it may import both `./kit/*` and the environment. Anything that composes THIS app belongs there rather than in `core/`.

- The two boundary tests and this section are INHERITED from `template-svelte`, the root of this template tree, where they are also enforced. A change to either that is meaningful for a sibling belongs there rather than here, or every sibling silently misses it.

## The words

**`CONTEXT.md` at the root is the glossary, and it is opinionated on purpose.**
It says what a cycle is, what a submission is, and which words the framework
deliberately does NOT take so that your game can have them: `round` and `turn`
are yours, and the framework never uses either. Read it before naming anything
new, and extend it when your game settles a word of its own.

**The template says `cycle`, and so do reveal-or-die and bomber-world; the
other games still say `epoch`.** That split is deliberate and it is how you
should read a grep.

In the template (`template-commit-reveal`) the rename has landed: `cycle` is the
interval, `cycleNumber` is its index, one player's pass through a cycle is a
`submission`, and apart from the one exception below `epoch` appears nowhere in
`web/src` or `contracts/src`. If you find another one there, it is drift and it
is worth fixing.

In a GAME repo built from this template, `epoch` is expected and means the game
has not been ported yet. Contracts are not inherited here, so each game carries
its own and is ported one at a time; a descendant full of `epoch` is a schedule,
not a stale glossary. reveal-or-die was ported on 2026-09-26, taking the
template's names wherever the concept is the same (`getCycleNumber`,
`_cycleNumber`, `InvalidCycle`, `lastCycleNumber`), and bomber-world follows it
by cascade. What a game must not do is use `cycle` for something that
is not the framework's interval.

**AND THE SAME READING APPLIES TO A MECHANISM, NOT ONLY TO A WORD.** `CONTEXT.md`
says a **commitment** is the head of a hash chain, each link holding one **chunk**
and the hash of the next, because a turn may be bigger than a transaction and the
framework owns that. A descendant's contracts may not have built it yet: its
`reveal` takes one array and resolves all of it, and there is no `furtherActions`
anywhere. That is the same schedule as `epoch`, for the same reason, and it is
visible in the same way - grep the contracts, not the glossary. Nothing breaks
while the two disagree, because the client half is a SEAM: `reveal` on the
adapter is one call that may be several transactions, and an adapter that needs
only one never reports progress. What a game must not do is chain the
commitment in its contracts and leave its client sending the whole turn, which
fails only in the reveal phase and costs the stake.

Two files keep an old word on purpose, and they are different cases. One keeps
`epoch`; the other keeps `round`, which is the other word this rename
moved (the shared interval became `cycle`, one player's pass became a
`submission`, and `round` and `turn` went back to being a game's own words).

**There used to be a third**, and what happened to it is worth a sentence,
because the reasoning was wrong rather than merely spent.
`web/src/lib/placement/storage.ts` kept an `epoch` field under
`__placement_round__` on the grounds that a serialised shape is a compatibility
surface with a stake behind it. The hazard is real (see the storage rule below)
and there was nothing for it to act on: template-commit-reveal had no committed
deployment records when this rename landed, so nothing was deployed and no
record could be in flight, and a game built FROM this template starts at its own
first deploy and cannot hold a record written by a previous build of the
template. The key and the field were renamed outright. **The general lesson is
that "nothing is deployed yet" is a claim you can CHECK, in one command, per
repo** - check it before building compatibility for it.

`web/src/lib/core/transaction/in-flight.ts` says `ms since epoch`, and that is
the UNIX epoch - a wall-clock origin, not this project's interval, so it was
never the word being renamed. It is also jolly-roger's file and byte-identical
to the stem's, which is the second reason to leave it: editing `lib/core` to
satisfy a grep buys a conflict in every future merge. A sweep that rewrites it
to `cycle` has made the comment false; that happened once already.

**There used to be one more, and it is the lesson about citations.**
`contracts/src/game/internal/UsingGameInternal.sol` cites bomber-world's cycle
function as the precedent for its identity seam. That is a DESCENDANT'S symbol,
so the citation is only correct while it spells the name that repo actually
uses. It said `_epoch()` until 2026-09-26, and a sweep once rewrote it to
`_cycleNumber()` early, naming a function that then existed in no repo. It says
`_cycleNumber()` now because bomber-world was ported that day: the citation
followed the descendant, not the glossary.

`web/test/svelte-conventions-boundary.test.ts` cites `game/core/round.ts` and
`RoundState` as a DESCENDANT'S file that failed a rune check. Same shape as the
bomber-world citation above: it is a record of what that repo called it at the
time, so the citation is only correct while it spells that name. It is also
byte-identical to jolly-roger's, and it is INHERITED from `template-svelte`
where the same rule is enforced - so it is catalogued here rather than annotated
at the line, because a comment in the file would diverge something every sibling
shares in order to record something only this repo knows. If it ever needs
saying in the code, it gets said upstream and comes back down.

That is also the general answer for this whole list: **a file identical to the
stem's does not get a local comment explaining why it is identical.** Write it
here, where a sweeper is told to look and where it cascades to the games.

The reasoning, the rejected alternatives and the migration order are in ADR-0001
(template-commit-reveal `work`).

## Commit-reveal rules

This template exists to build simultaneous-turn games. Three rules follow from
that, and every one of them is easy to break by accident.

- **A reveal must not branch on state another reveal in the same cycle could
  have changed.** Reveals arrive in whatever order the mempool delivers them,
  so the board after a set of commitments must not depend on that order. If it
  does, whoever pays the most gas decides the outcome, and committing bought
  nothing. Accumulate (`+=`); do not compare against another player's state.

  Rules like "the first to reveal takes the cell" or "reject a cell that is
  already taken" look reasonable and violate this.
  `contracts/test/js/Game.test.ts` asserts the property directly by replaying the same commitments in two
  different orders; keep that test working when you change resolution rules.

  The test is whether the ORDER can change what a player GETS, not whether
  shared state is read at all. In template-commit-reveal's own reference game
  there is exactly one place that reads it on purpose: `_place` checks whether a cell has ever been claimed so it can add it
  to a per-zone index once, and the indexed set, every stake and every player's
  position come out identical either way (only the array order and which reveal
  pays for the append differ). That argument is written next to the code and
  pinned by a test that compares the zone listing as a SET in both orders. If
  you need the same exemption, do both of those things; if you cannot make the
  argument, you are looking at the rule, not at an exception to it.

- **Something must be at stake, or nobody has to reveal.** A player who dislikes
  what they committed to can simply go quiet. The template makes this concrete
  with a token reserve bonded at commit time and forfeited by
  `acknowledgeMissedReveal`. A game may gate differently (custody of an NFT, for
  instance); what the framework needs is only that _something_ is lost by not
  revealing.

- **Renaming a persisted key or field forfeits the stake of every player who
  has one in flight, and every suite stays green while it happens.** The secret
  that opens a commitment lives in the browser, in your game's own submission
  storage (`placement/storage.ts` in template-commit-reveal's reference game,
  `world/storage.ts` in reveal-or-die and bomber-world), and nowhere else. `load()` discards
  any record it cannot read, so a record written by the previous build under
  the old name is not a migration problem, it is a player who can no longer
  reveal: the commitment stands, the reveal never comes, and
  `acknowledgeMissedReveal` takes what was bonded.

  **Nothing catches this.** The tests are renamed alongside the code, no test
  reads a record written by an older build, and the type checker sees a rename
  rather than a break. It is found by a player, at their own expense, and only
  after you ship.

  So once your game has users, the storage key and every field name in the
  record are a WIRE, not an identifier: treat a change to either the way you
  would treat a change to the ABI. If you must, read both shapes for a release
  and write the new one, and delete the tolerance once no in-flight record can
  predate it. Before your first deploy this costs nothing, which is exactly when
  to get the names right - and "nothing is deployed yet" is a claim to check
  (`git ls-files contracts/deployments`) rather than assume.

## Where the plan and the handoff live: the `work` branch

**They are not in this working tree, so `ls` and `find` will not show them.** Every repo in this tree keeps its maintainer material on an orphan branch called `work`, which has no merge base with anything and therefore never cascades into a descendant. Nothing checks it out. Start by asking what this repo's branch holds, rather than assuming a path:

```bash
git ls-tree -r --name-only work        # what THIS repo keeps there
git show work:<path>                   # read one
git worktree add ../<repo>-work work   # or check it out beside the repo
```

**The plan for the whole template tree lives on `template-commit-reveal`'s `work` branch**, at `work/specs/proposed/games-on-this-foundation.md`. It is the source of truth for intent: the phase order, the decisions with their reasoning, the measured baselines for the template and its descendants, and what each phase deliberately does NOT do. A game built from this template does not carry a copy, by design, so read it there. Alongside it are `HANDOFF.md` (repo state and environment gotchas) and `work/tasks/` (staged work items).

If reality contradicts the plan, change the document in the same commit as the code that proved it wrong, and say which claim was wrong.

The README's ADR section points at `work:docs/adr/`. That is **jolly-roger's** branch layout, and a repo further down this tree may hold nothing at that path; the listing command above is the reliable route. template-commit-reveal's README is byte-identical to jolly-roger's and is deliberately left that way; a game's README is its own, and says nothing about this.

**AN ADR NUMBER IS ONLY MEANINGFUL WITH A REPO ATTACHED, now that template-commit-reveal has ADRs of its own.** Every bare citation in the code (`ADR-0002`, `ADR-0004`) means **jolly-roger's**, which holds 0001 to 0008 and will keep adding to them; template-commit-reveal's own sequence starts again at 0001 and is unrelated. Read a bare number as jolly-roger's, and write new citations as "ADR-0001 (template-commit-reveal `work`)". The existing bare ones are left alone deliberately: most are in files byte-identical to the stem's, where editing them would be the divergence-by-copy this tree keeps paying for.

## Before you commit a cascade, in this repo or in a descendant

**Run `node scripts/check-dangling-imports.mjs`.** It takes about a second, needs no install and no `svelte-kit sync`, and it is the one check that fires at the moment the mistake is made rather than one step after it. `scripts/apply-omissions.sh` already runs it for you, so this only needs remembering when the merge had no modify/delete conflict to resolve.

**The reason is measured, twice, and both times in a descendant.** Two cascades out of `template-commit-reveal` have broken `reveal-or-die`, and both were broken by a hunk that merged CLEANLY and reported no conflict at all: in 2026-09-09 the template deleted `game/render/pixi/PixiCanvas.svelte` and reveal-or-die's own `world/render/index.ts` went on importing it; in 2026-09-23 five files arrived there as clean ADDS carrying nine imports of `$lib/placement`, which is the TEMPLATE's game and a directory reveal-or-die had deleted long ago (its own game is `$lib/world`). Four routine-looking conflicts invite resolve-and-move-on, and `--verify` catches both one step late. **The check lives at the template rather than only in the repo that got burnt, because the defect is the tree's**: every game deletes the template's game and writes its own, so every one of them is one clean hunk away from the same failure, and a check only the burnt repo carries is a check the next repo has to get burnt to acquire. `scripts/dangling-imports.mjs` holds the reasoning and why it is repo-local rather than in `offshoot-fanout`, where it belongs.

NAMING BOTH REPOS IS DELIBERATE, because this paragraph is inherited: written as "this repo" it is true at whichever level it was written and false one level down, which is the same defect as a game directory arriving in the wrong repo. The third cascade proved the point twice over - it carried this section into reveal-or-die reading as though `$lib/placement` were that repo's game, and the check it carried alongside caught an import the same merge had stranded.

Two environment facts worth having before the first command, because both have cost real time: **check how `pnpm` is reached before assuming** (`pnpm --version`; on some hosts here it is not on PATH and lives at `~/.volta/bin/pnpm`, on others it is on PATH and volta is not installed at all - an absolute path written down as a project fact has already cost a session its first command), and **`web/src/lib/deployments.ts` is generated and gitignored**, so a `check` failure inside `$lib/core` that the stem does not have means regenerate it before touching anything shared. The rest are in the handoff.

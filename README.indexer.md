# `with/indexer`

The node for a game whose state is built from its events by an etherfold processor: `web/src/lib/indexer/` hosts a game's processor in a live chain's worker, an offline world's worker and a Node process (`contracts/utils/indexer.ts`), and the reference game reads its board from its own processor here (`web/src/lib/placement/indexer/`) instead of polling it by camera. `web/src/lib/indexer/README.md` is how a game uses it.

```
template-commit-reveal@main
├─ with/pixi-js
├─ with/nft-identity
├─ with/fuzd
├─ with/indexer            ← here
├─ with/all                [with/pixi-js, with/nft-identity]          reveal-or-die, bomber-world
└─ with/fuzd-pixi-indexer  [with/fuzd, with/pixi-js, with/indexer]    stratagems stems from it
```

**Why a node and not `main`**: which state layer a game wants follows its cycle length (a fast game reads logs or polls, a 24-hour game wants an indexer), so it is an axis per game. On `main` every game would carry etherfold's install, its CLI and libSQL, including the two fast games that do not use them. Not jolly-roger either: a jolly-roger layer reaches the games only through its `integration`, so into every game, and the cycle stamp and the world's worker are below jolly-roger anyway. Decided in stratagems' step X (PX6 and PX7 of its plan, `join-template-commit-reveal` branch).

**What it changes from `main`**: the new module and its tests, `contracts/utils/indexer.ts` (with its export and the `utils` directory compiled), the etherfold and libSQL dependencies, the reference game's `$lib/placement/indexer/` and its test, the reference game's composition (`placement/context.ts`: `board` is the indexed state), and the offline world deleting a forgotten world's index (`offline.ts`). The poller (`placement/state.ts`) stays, unused here, so `main`'s file is untouched.

**Cascade ritual**: `main` into this node, then this node into `with/fuzd-pixi-indexer` beside `with/fuzd` and `with/pixi-js`.

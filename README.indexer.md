# `with/indexer`

The node for a game whose state is built from its events by an etherfold processor: `web/src/lib/indexer/` hosts a game's processor in a live chain's worker, an offline world's worker and a Node process (`contracts/utils/indexer.ts`), and the reference game reads its board from its own processor here (`web/src/lib/placement/indexer/`) instead of polling it by camera. `web/src/lib/indexer/README.md` is how a game uses it.

```
jolly-roger@main ─ jolly-roger@with/indexer          the framework half, game-agnostic
                       │
template-commit-reveal@upstream/with/indexer          a second root, fed from it, carrying nothing of this repo's
template-commit-reveal@main                           fed from jolly-roger@integration
├─ with/pixi-js
├─ with/nft-identity
├─ with/fuzd
├─ with/indexer            [main, upstream/with/indexer]   ← here
├─ with/all                [with/pixi-js, with/nft-identity]          reveal-or-die, bomber-world
└─ with/fuzd-pixi-indexer  [with/fuzd, with/pixi-js, with/indexer]    stratagems and infinite-gambit stem from it
```

## Two halves, two homes

**The framework half is jolly-roger's** (`with/indexer` there, from its `main`): `web/src/lib/indexer/host.ts` (the worker bodies: one tab indexes under an election, or a world's database), `follower.ts` (the GraphQL read, re-reading only what moved, pinned by block hash), `worker-choice.ts` (which worker a deployment runs; which chains are a world is the app's to say, `{isWorld}`), `indexed.ts` (`createIndexed`, an app's indexed read as one store), `contracts/utils/indexer.ts` (`indexInProcess`, the processor in Node over libSQL) and `contracts/utils/in-process-chain.ts` (`deployInProcess`, this repo's `deploy/` into hardhat's chain in the process), with their tests. None of them names a game, a cycle or a chain in the tab, so any app built on jolly-roger can index, not only a game.

**The commit-reveal half is this node's**: `indexed-state.ts` (the `OnchainStateStore` the skeleton reads, `$lib/game/core/seams`, built on jolly-roger's `createIndexed`), `cycle-stamp.ts` (the cycle a read is stamped with, from the block's timestamp or the game's folded `CycleAdvanced`), `index.ts` (what a game imports), the reference game's `$lib/placement/indexer/` and its composition, and the offline world's index forgotten with the world (`offline.ts`). This node passes `{isWorld: isEmbeddedChainId}` wherever it picks a worker (`placement/indexer/board.ts`, `boardWorker`), since jolly-roger's default is that no chain is a world.

**How the first half arrives: a second root, `upstream/with/indexer`.** A branch of this repo has either in-repo stems or one cross-repo `stemBranch`, never both (offshoot-fanout refuses the combination), and `main` is fed from jolly-roger's `integration`. A jolly-roger layer beside `integration` would otherwise reach this repo only by entering `integration`, and so every game and template-zk-game, including the fast games that do not index (they would carry etherfold's install, its CLI and libSQL). Instead `upstream/with/indexer` is a root of this repo fed from jolly-roger `with/indexer` (`{"stemBranch": "with/indexer"}` on the `offshoot` branch), holding jolly-roger's branch exactly, and `with/indexer` merges `main` then `upstream/with/indexer`. Any later jolly-roger layer a game wants comes the same way (`upstream/with/messaging`). Decided in the tree's plan (jolly-roger `work`, `docs/plans/template-tree-features.md`, F1-2), replacing stratagems' step X decision (PX6 and PX7) that the indexer was "not jolly-roger": that was right while a jolly-roger layer could reach the games only through `integration`.

**Why a node and not `main`**: which state layer a game wants follows its cycle length (a fast game reads logs or polls, a 24-hour game wants an indexer), so it is an axis per game. On `main` every game would carry etherfold's install, including the two fast games that do not use it.

## What it changes from its stems

Each file is in `.offshoot-divergences`, under `[with/indexer]`, with its reason, listed only when it differs from both stems: the etherfold and libSQL dependencies on this repo's packages (`package.json` and its `pnpmDepsHash`, `contracts/package.json`, `contracts/tsconfig.json`, `web/package.json`, the lockfile), the reference game's composition (`placement/context.ts`: `board` is the indexed state), the offline world (`offline.ts`), this file, and `.offshoot-omissions`, which drops what `upstream/with/indexer` brings and this repo cannot build: jolly-roger's demo of the indexer (it counts greetings, and GreetingsRegistry is omitted here), the tests that fold it, and `main`'s Sepolia records. The poller (`placement/state.ts`) stays, unused here, so `main`'s file is untouched.

**Cascade ritual**: jolly-roger `with/indexer` into `upstream/with/indexer` (its tree stays jolly-roger's: nothing of this repo's is committed there), then `main` and `upstream/with/indexer` into this node, then this node into `with/fuzd-pixi-indexer` beside `with/fuzd` and `with/pixi-js`. A change to the framework half is made at jolly-roger, never here.

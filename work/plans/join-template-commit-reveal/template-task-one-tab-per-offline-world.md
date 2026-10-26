---
title: One tab per offline world; a second tab is refused, with a way to take the world over
slug: one-tab-per-offline-world
spec: games-on-this-foundation
blockedBy: []
---

# Two tabs can open the same offline world, and the two copies of its chain diverge

DRAFTED IN STRATAGEMS, NOT YET ON template-commit-reveal's `work` BRANCH: P11 of step O in stratagems' port plan (`join-template-commit-reveal` branch, `work/plans/join-template-commit-reveal.md`), decided with the maintainer on 2026-10-26 and named step T1 there. It goes to `work/tasks/backlog/one-tab-per-offline-world.md` there once the maintainer approves it; nothing has been pushed.

## Start here, from a cold context

```sh
cat CONTEXT.md
git show main:web/src/lib/embedded/README.md
git show main:web/src/lib/embedded/node.ts | grep -n -i "persist"     # webevm dumps after every block
git show main:web/src/lib/offline.ts | grep -n "rememberChainId\|offline-world-chain"
git show main:web/src/routes/offline/+page.svelte
```

## What is wrong today

A world is persisted in the browser: webevm's dump (`offline-world-chain:<id>`), the deployment records (`offline-world-deployments:<id>`) and the chain id in localStorage (`offline-world:chain-id`). Open `/offline/` in a second tab and it restores the same id, the same dump and the same records, boots a second node from them, and from then on each tab mines its own blocks and writes its own dump over the other's. Nothing in the template stops it, in any game: the hazard is in what every world shares, not in a game's composition. A game that indexes its world in the tab (stratagems, whose index is IndexedDB per world) gets a third writer on top.

## Proposed

- The boot in `$lib/embedded` (or the world's open, wherever every game passes through) takes a Web Lock named by the world's chain id (`navigator.locks.request('offline-world:<id>', {ifAvailable: true}, ...)`) and holds it for the life of the tab; a world that cannot take it does not boot and says why.
- `routes/offline/+page.svelte` (byte-identical across games) renders that refusal: the world is open in another tab, with two ways on, take it over there (the holder is told to let go, and this tab boots once it has) or go back.
- No game's `offline.ts` changes; every game gets the guard by cascade.

## Acceptance

- A unit test of the lock (a second boot of the same id is refused while the first holds it, and boots once it lets go), and an e2e that opens a second page on `/offline/` and sees the refusal.
- The node verify and the e2e pass at the template and at every node after the cascade.

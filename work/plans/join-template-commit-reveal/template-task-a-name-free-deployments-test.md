---
title: The embedded deployment test names no game's contract, so every game carries it byte-identical
slug: a-name-free-deployments-test
spec: games-on-this-foundation
blockedBy: []
---

# `test/lib/embedded/deployments.test.ts` indexes `contracts.Game`, so a game whose contract is not called `Game` cannot type-check it

DRAFTED IN STRATAGEMS, NOT YET ON template-commit-reveal's `work` BRANCH: P10 of step O in stratagems' port plan (`join-template-commit-reveal` branch, `work/plans/join-template-commit-reveal.md`), decided with the maintainer on 2026-10-26. It goes to `work/tasks/backlog/a-name-free-deployments-test.md` there once the maintainer approves it; nothing has been pushed.

## Start here, from a cold context

```sh
cat CONTEXT.md
git show main:web/test/lib/embedded/deployments.test.ts | grep -n "Game"
git show main:web/src/lib/embedded/README.md | grep -n -A3 "expectedContractNames"
git show main:web/src/lib/embedded/deployments.ts | sed -n 30,90p   # expectedContractNames, the cast to the build-time type
```

## What is wrong today

The test exercises the MECHANISM (`createEmbeddedDeployments` refuses a world missing an expected contract, carries the minted chain id, has no rpc url, knows the build-time names), and one line of it indexes `store.get().contracts.Game`. That type-checks only in an app whose generated `$lib/deployments` has a `Game` key, because `createEmbeddedDeployments` casts its runtime record back to the build-time literal type. So a test of the framework is coupled to a game's contract name through an inferred type. reveal-or-die carries it byte-identical only because its game is also called `Game`; stratagems (`Stratagems`) omits it in its `.offshoot-omissions` and so runs none of its four cases. The template's own `$lib/embedded/README.md` already names the fix.

## Proposed

- The fixture name is one the app cannot have (for instance `__Fixture__`), or is read off `expectedContractNames()`, and the store's records are read through a widened type (`Record<string, {address: string}>`) in the test, so nothing in the file names a game.
- The README's paragraph about the divergence goes, since there is none.
- Cascaded: reveal-or-die and bomber-world keep the stem's bytes; stratagems drops the entry from `.offshoot-omissions` and gains four cases.

## Acceptance

- `git grep -n "contracts.Game\b" web/test/lib/embedded/deployments.test.ts` is empty.
- The node verify passes at the template and at every node after the cascade; stratagems' unit count rises by the file's cases.

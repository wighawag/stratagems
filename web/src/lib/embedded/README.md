# `$lib/embedded`: a chain that runs in this tab

Inherited from jolly-roger's `with/embedded-chain`, through the `integration` node this repo's `stemBranch` points at. It boots an execution-only EVM (`webevm`) in the browser, runs an app's own rocketh deploy scripts onto it through `@rocketh/web`, announces a wallet for it, and hands back a world: a `ConnectionFactory` plus the deployment records that describe THAT chain.

**It is the MECHANISM and it is complete. This game's composition of it is `$lib/offline.ts`**, and what this file records is what came down, what was deleted on the way, and what building the composition on top of it found.

## What came down, and what was deleted on the way

The stem carries three things, and only the first is the framework's:

| what                    | where                  | kept here?                                                    |
| ----------------------- | ---------------------- | ------------------------------------------------------------- |
| the mechanism           | `lib/embedded/`        | **yes**, and it is what this directory is                     |
| that app's own world    | `lib/offline.ts`       | **no** - it deploys a greetings registry                      |
| the route that shows it | `routes/offline-demo/` | **no** - this repo deletes inherited demo routes (`d34ad44b`) |

Deleting the second two is the rule the stem's own README states: the mechanism lives in `lib/` and a route is only its demo, precisely because a descendant throws the demo away. They arrived as clean ADDS with nothing to conflict against, which is the shape this tree keeps paying for, and so did two things that came with them: a `jolly-roger-contracts` workspace dependency in `web/package.json` naming a package that does not exist in this workspace, and a "Play Offline" button on the home page linking to the route that is now gone.

**Both of those names are taken now, by this game's own versions of them**: `web/src/lib/offline.ts` deploys THIS game's contracts, `web/src/routes/offline/` is this game's route rather than an inherited demo, the home page's button points at it, and `web/package.json` depends on `template-commit-reveal-contracts`, which this workspace does have. So the next merge from the stem meets a file that exists rather than one that was deleted, and the conflict will be a real one about content.

## THE TEST THAT WAS DELETED, AND IS BACK

`web/test/lib/embedded/world.test.ts` did not survive the move: it booted a real chain, ran a real deploy on it, built a real `createContext({establishConnection})` on top and asserted the context's members were the world's BY IDENTITY, and it was deleted here because it deploys `001_deploy_greetings_registry` from the stem's contracts, which are not inherited in this tree.

**It was ported back once this game's own offline deployment existed, because that deployment is what it had been waiting for.** Porting it was cheap in SHAPE (two imports, three deploy scripts, a contract name) and the substance was the deploy DATA: a world of this game is a MANUAL cycle policy with both phase durations zero, and until `$lib/offline.ts` decided that there was nothing to point the test at. It deploys exactly what the offline route deploys - `OFFLINE_DEPLOYMENT` is exported from `$lib/offline` for that reason, so the test cannot assert against its own copy of the decision - and it covers two things a test of the mechanism could not: that the client reads the policy back as `manual` with every gas figure untouched, and that the stake this game hands its offline player is bonded to the PLAYER while the deployer pays.

**So `createContext`'s connection parameter has a proven second caller here now**, which is what the claim about that seam was missing in this repo.

**One of the four mechanism suites had to be edited, and the reason is a small design point rather than a chore.** `deployments.test.ts` named `GreetingsRegistry`, and one line of it did not merely MENTION the name, it indexed `store.get().contracts` by it - which type-checks only in the app whose generated `$lib/deployments` has that key, because `createEmbeddedDeployments` casts its runtime record back to the build-time literal type. So a test of the MECHANISM was coupled to the app's contracts through an inferred type, and it says `Game` here.

That is a divergence in a shared file and it will conflict whenever the stem edits that file. The fix that would end it belongs upstream and is worth doing when somebody is there: the name is incidental to what the test asserts, so a fixture name the app cannot have (or one read off `expectedContractNames()`) makes the file identical in every repo again.

## What this game wrote on top of it

1. **A client that calls `advanceCycle`** (`$lib/game/core/advance.ts`, with this game's half in `$lib/placement/advance.ts`). Under the manual policy a round is commit, advance, reveal, advance, and a reveal sent before the advance is refused with `InCommitmentPhase`. **That was a gap in the FRAMEWORK and not in the world** - a manual deployment on an ordinary remote chain could not complete a round either - which is why it is framework, why it is inert under the timed policy, and why the embedded world only EXPOSED it.
2. **The in-tab deploy's data** (`OFFLINE_DEPLOYMENT` in `$lib/offline.ts`): `cyclePolicy: Manual` with both phase durations zero, which is one decision and not three because the contract refuses a configuration whose durations disagree with its policy. Everything else is spread from the deploy's own `default`, because it is measured against the CONTRACTS and webevm agrees with hardhat to the unit.
3. **A provisioning hook that gives the offline player whatever THIS game puts at stake.** Here that is a bonded ERC20, bought through the same `StakeSale` rail an online purchase uses; on `with/nft-identity` and in reveal-or-die it is an identity token they must own; elsewhere it is something else again, because the framework requires only that something is lost by not revealing. This file is inherited unchanged by every repo below, so it must not name one game's answer as though it were the framework's.
4. **The route** (`/offline`), which is the choosing and nothing else, and the "Play Offline" button on the home page.

## What building it found, which nothing else could have

- **The local signer broadcast to the WRONG CHAIN.** `createCoreContext` built the signer's transport from the app's own `PUBLIC_NODE_URL`, so a commit made in the world was posted to the remote chain's node. It is invisible in a dev run with no node url configured (the signer then already falls back to the connection's provider) and invisible on the branch the mechanism came from (which targets `WalletConnected` and has no signer). `EstablishedConnection.nodeURL` is the fix: the factory reports what it actually used, and a world that ignored the app's url reports nothing. That is a shared-file change in `lib/core` and it belongs upstream.
- **`ensureConnected()` hangs at `WalletConnected` when the app signs in.** The step after it is a SIGNATURE, which in the app is a button on the connection flow; a nested world mounts no flow, so nobody presses it. The world asks for the signature itself (`connectOfflinePlayer`), which is honest only because the wallet is one this world generated seconds ago and auto-approves.
- **The app's overlays are mounted in the LAYOUT**, outside every route subtree, so a flow started inside a nested world drives stores nothing on screen is reading and the button appears to do nothing. `$lib/context/InWorld.svelte` is that subset, with the connection flow deliberately left out.
- **Provisioning runs on every boot, and a boot is not always a first boot.** The chain and the records persist, so a reload restores the world, skips the deploy and provisions again: the stake went from 10 to 20 to 30 across reloads until `stakeForOfflinePlayer` started asking the chain first. A stake that can be refilled by pressing F5 is not a stake.

## The combination nobody had run, and what it cost

A world takes the app's `targetStep` rather than choosing one, deliberately: a world chooses the CHAIN, never how the app authenticates. This repo's `TARGET_STEP` is `SignedIn`, so an embedded world here runs with a LOCAL SIGNER derived over the world's own burner wallet - a combination that exists on no branch upstream, since `with/embedded-chain` alone targets `WalletConnected`.

**A browser has been pointed at it now, and it produced the first two entries in the list above**: the hang at `WalletConnected`, and the signer broadcasting to the app's node instead of the world's. Both are properties of exactly that combination, both are invisible to `check` and `test:unit`, and one of them is invisible in a dev run as well. `web/e2e/tests/offline.e2e.ts` is what stops them coming back.

## And one that is known to be wrong and is not yours

`onchain/state.ts` sizes its block range as `floor(4 * cycleDuration / averageBlockTime)`, and under the manual policy `cycleDuration` is zero, so the span is zero and `fromBlock === toBlock` on every poll. This game reads the board out of contract storage and ignores `fromBlock`, so it cannot see it; a game that builds state from LOGS can, and conquest is that game. Do not fix it here. If it DOES bite this game, the finding that says it cannot is wrong and changes in the same commit as whatever proved it.

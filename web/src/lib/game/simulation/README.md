# Simulation

A commit-reveal game shows the player what their plan will do before the chain resolves it. This module lets a game do that by running the contract's OWN bytecode, in the browser, so the preview is the rule the reveal applies rather than a copy of it in TypeScript that can drift from it.

## What it asks of a game's contracts

One rule: **the resolution must be callable as a function of its inputs.** The sandbox holds a contract's code and none of its state, so a function that reads storage it did not write itself reads zeroes there and answers wrongly rather than failing. There are two ways to keep the rule: a pure core (below, the reference game's) or, for a storage-heavy resolution, a simulation contract that seeds storage of its own ("The second pattern").

For the first, the resolution is written in three parts, the shape the commit-reveal order rule already pushes towards:

1. **load**: read from storage what a move needs (its cells, its player's holdings);
2. **a pure core**: decide what the move does, from those inputs alone (`internal pure`);
3. **apply**: write what the core returned, emit the events, and do whatever bookkeeping is not a consequence of the move (an index for readers, say).

and a route exposes the core to clients (`external pure`, or `view` if it reads only immutables, which live in the code). The reveal runs load, core, apply; the route runs the core on what the client hands it. The contracts suite then uses the reveal as the route's oracle: preview a turn, reveal it, compare.

A pure function may not read an immutable, so a deployment constant the rule needs (a cost) is a parameter of the core, and the route passes it.

## The worked example: the template's game

These paths are the reference game's, in `template-commit-reveal`. A game built from the template replaces that game wholesale, so in its repo they do not exist: it writes its own route over its own pure core, and keeps this module.

- the rule is `_placementOutcome` in `contracts/src/game/internal/UsingGameInternal.sol`, between `_loadPlayerCell` and `_applyPlacement`; the per-zone index stays in apply, which is why the order-independence argument written beside it is unchanged;
- the route is `contracts/src/game/routes/GameSimulation.sol` (`resolvePlacements`), deployed as `Game_Implementation_Router_Simulation_Route`;
- `contracts/test/js/Simulation.test.ts` compares its answers with what the reveal does;
- the client is `$lib/placement/preview.ts`: it loads each planned cell as the player sees it, runs the route in the sandbox, and the view draws what the cell will hold.

## The second pattern: the unchanged resolution over storage of its own

The pure core is the right shape for a rule that is cheap in memory, as the reference game's is. It is the wrong one for a rule that is storage-heavy, where a turn reads and writes many cells and pays out as it goes: memory in the EVM is priced quadratically and never freed within a transaction, while a storage slot once touched is a cheap map, so rewriting such a resolution over an in-memory table makes every reveal dearer. Measured on stratagems (32 moves, about 160 cells): **+19.4% gas on every full chunk**, with every test still passing.

So such a game keeps its resolution exactly as it is, and adds a contract of its own, deployed beside the game with the same configuration, that inherits that resolution and:

1. **seeds** its own storage with the cells a client hands it (clearing every slot the resolution can read first, so nothing left from an earlier call can reach an answer);
2. **runs** the unchanged resolution over it;
3. **returns** the touched cells after the turn, and what left the resolution (payouts, points), which it RECORDS rather than sends: the game routes every external effect of its resolution through an `internal virtual` hook (resolved at compile time, so it costs the reveal nothing), and the simulation overrides each one to append to a list it returns. No stub contract is needed in the sandbox.

Its functions write, so they are not `view`; the sandbox runs them anyway, since an `eth_call` discards whatever it wrote. The contracts suite is again the oracle: before each reveal of a random history, simulate it over the stored cells, reveal it, compare.

**Never deploy it as a route behind the game's proxy.** A route runs in the proxy's storage, so the simulation's seeding would overwrite the live board.

This is stratagems' `contracts/src/game/simulation/StratagemsSimulation.sol` (the hooks are `_multiTransfer`, `_addPoints` and `_removePoints`), held to the chain by its `test/Stratagems.simulation.test.ts`; stratagems is a descendant of this template, so those paths are its own.

## The two parts

`createBytecodeSandbox({contracts, provider})` (`./sandbox.ts`) runs calls against a bare webevm node with a code override. A contract's code is either `{address}`, read once with `eth_getCode` through the provider (the deployed bytes, immutables included, in whatever world the app is in), or `{creationCode}`, run into the sandbox once, for a contract deployed nowhere on its own. Nothing is imported or started until the first call. In the browser the node runs in a Worker (`./worker.ts`); pass `node` to run it elsewhere.

`latestResult(inputs, run)` (`./latest.ts`) is how an asynchronous answer reaches the synchronous view seam: the game feeds its plan in, and the store publishes only the result for the CURRENT input, so a preview of the plan as it was a click ago is never drawn over the plan as it is. The view seam does not change: the game's merge reads the last result out of its local state.

## What it is not

It previews ONE player's turn, which is all a preview can be: the others' turns are committed hashes. It does not replace reading the chain, and it runs on the default engine; a game whose resolution is heavy enough to want revm builds its own Worker with webevm's `exposeNode({createEngine})` and passes it as `node`.

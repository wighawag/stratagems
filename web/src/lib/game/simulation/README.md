# Simulation

A commit-reveal game shows the player what their plan will do before the chain resolves it. This module lets a game do that by running the contract's OWN bytecode, in the browser, so the preview is the rule the reveal applies rather than a copy of it in TypeScript that can drift from it.

## What it asks of a game's contracts

One rule: **the resolution must be callable as a function of its inputs.** The sandbox holds a contract's code and none of its state, so a function that reads storage reads zeroes there and answers wrongly rather than failing.

So the resolution is written in three parts, the shape the commit-reveal order rule already pushes towards:

1. **load**: read from storage what a move needs (its cells, its player's holdings);
2. **a pure core**: decide what the move does, from those inputs alone (`internal pure`);
3. **apply**: write what the core returned, emit the events, and do whatever bookkeeping is not a consequence of the move (an index for readers, say).

and a route exposes the core to clients (`external pure`, or `view` if it reads only immutables, which live in the code). The reveal runs load, core, apply; the route runs the core on what the client hands it. The contracts suite then uses the reveal as the route's oracle: preview a turn, reveal it, compare.

A pure function may not read an immutable, so a deployment constant the rule needs (a cost) is a parameter of the core, and the route passes it.

## The worked example: the template's game

- the rule is `_placementOutcome` in `contracts/src/game/internal/UsingGameInternal.sol`, between `_loadPlayerCell` and `_applyPlacement`; the per-zone index stays in apply, which is why the order-independence argument written beside it is unchanged;
- the route is `contracts/src/game/routes/GameSimulation.sol` (`resolvePlacements`), deployed as `Game_Implementation_Router_Simulation_Route`;
- `contracts/test/js/Simulation.test.ts` compares its answers with what the reveal does;
- the client is `$lib/placement/preview.ts`: it loads each planned cell as the player sees it, runs the route in the sandbox, and the view draws what the cell will hold.

## The two parts

`createBytecodeSandbox({contracts, provider})` (`./sandbox.ts`) runs calls against a bare webevm node with a code override. A contract's code is either `{address}`, read once with `eth_getCode` through the provider (the deployed bytes, immutables included, in whatever world the app is in), or `{creationCode}`, run into the sandbox once, for a contract deployed nowhere on its own. Nothing is imported or started until the first call. In the browser the node runs in a Worker (`./worker.ts`); pass `node` to run it elsewhere.

`latestResult(inputs, run)` (`./latest.ts`) is how an asynchronous answer reaches the synchronous view seam: the game feeds its plan in, and the store publishes only the result for the CURRENT input, so a preview of the plan as it was a click ago is never drawn over the plan as it is. The view seam does not change: the game's merge reads the last result out of its local state.

## What it is not

It previews ONE player's turn, which is all a preview can be: the others' turns are committed hashes. It does not replace reading the chain, and it runs on the default engine; a game whose resolution is heavy enough to want revm builds its own Worker with webevm's `exposeNode({createEngine})` and passes it as `node`.

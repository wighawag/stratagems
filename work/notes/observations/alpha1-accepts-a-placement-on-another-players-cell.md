---
title: alpha1's contract accepts a placement on a cell another player owns, which the client never sends, and it is the one move that makes reveals order-dependent
type: observation
status: spotted
spotted: 2026-10-24
relates-to: work/plans/join-template-commit-reveal.md (step 10b)
---

# alpha1 accepts a placement on another player's cell

Found while measuring the port's order (2026-10-24), read from `contracts/src/game/internal/UsingStratagemsSetters.sol` and run through `common/src/stratagems.ts`, the TypeScript copy of the same rules.

**What the contract does.** `_computeMove` refuses a `Color.None` move unless the cell is the player's and at full life, and turns a second placement on a cell placed this epoch into Evil. A coloured move onto a cell someone else owns, alive or dead, passes neither check and goes through `_completeMove`: the cell takes the mover's colour and owner for one gem. The client never builds that move (`web/src/lib/stratagems/actions/ActionHandler.ts` opens the land menu instead), so it is reachable only by calling the contract directly.

**What it costs**, measured on one cell with `work/plans/join-template-commit-reveal/overwrite.ts`: B takes A's live cell; A's gem stays in the contract, counted in no cell's stake; and A KEEPS the reward points for the cell, because nothing tells the generator, so the points are counted twice. Not checked against the deployed contract or the rewards generator on chain.

**Why it matters for the port.** It is the whole of alpha1's order dependence. Replayed in every order of three players over random epochs (`order-check.ts` beside the plan): 0 of 60,000 trials change with the order when every move is one the client allows, 659 of 3,000 when every move the contract accepts is allowed, and the difference comes from this class alone. In one epoch where A re-places their own cell and B overwrites it, A-then-B gives B the cell and B-then-A makes it Evil. Refusing the move against the current board does not fix it (2,197 of 10,000 still differ): the rule has to be judged against the board before the cycle's reveals, which is what step 10b now says.

alpha1 is dormant (no log since Base block 23,303,136), so this is a record, not an incident.

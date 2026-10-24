---
title: alpha1's acknowledgeMissedReveal burns from the caller's reserve, not the player's
type: observation
status: spotted
spotted: 2026-10-24
relates-to: work/plans/join-template-commit-reveal.md (step 10b, 10a-contract)
---

# The missed-reveal acknowledgement charges whoever calls it

`contracts/src/game/routes/StratagemsReveal.sol`, `acknowledgeMissedReveal(address player, bytes32 secret, Move[] moves, bytes24 furtherMoves)`: it checks and advances `_commitments[player]`, then does `_tokensInReserve[msg.sender] -= amount` and transfers `amount` to the burn address. So a third party acknowledging another player's missed reveal either reverts (no reserve) or pays the penalty out of their own reserve, and the player who went silent keeps theirs. When the player calls it themself, it behaves as intended.

Read from the source, not exercised on chain. alpha1 is dormant, and step 10b replaces this route with the base's settlement (10a-contract), which takes the penalty from the player's bond, so the fix is the rebuild rather than a patch.

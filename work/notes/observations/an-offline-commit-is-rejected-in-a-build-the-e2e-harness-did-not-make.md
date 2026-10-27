---
title: A commit in the offline world is rejected by the contract in a plain local build, while the e2e's build of the same tree plays a whole cycle
type: observation
status: spotted
spotted: 2026-10-27
relates-to: work/plans/join-template-commit-reveal.md (step T1's by-hand check; steps 8 and D)
---

# The offline world commits in the e2e and not in a build made by hand

Found while checking step T1 by hand. Built with `PUBLIC_WALLET_HOST= pnpm build localhost` (the e2e harness's own build command) and served with `pnpm run preview`, driven by Playwright in headless Chromium with the e2e's own helpers: the lobby, a world of three, the browser's key authorised (`delegation` read back `allowed`), cycle 2, the 32-gem stake, two moves planned on the canvas, "Commit now". The submission goes `Committing`, then `Error` during `commit`: "The commitment was rejected by the contract". The cycle never moves.

**It is not step T1's**: the same run against a build of the integration branch BEFORE T1 (944933433) fails the same way. **It is not the app's node being down**: it fails the same with `PUBLIC_NODE_URL` and `PUBLIC_CHAIN_INFO_NODE_URL` pointed at a live local node (`local_node` on 8557). And `e2e/tests/stratagems-offline.e2e.ts` plays the identical sequence and passes on the same commit (50 of 50 at T1).

What differs is how the build was made. The harness deploys the contracts to its own chain and exports those records before building; a hand build takes whatever `web/src/lib/deployments.ts` the install generated (here chain 31337, "Anvil"). The world reads parameters off the build-time deployment (step O: "gas, chunk, gem, stake and life equal to the build-time deployment's"), so a build-time record that does not match the contracts the world deploys is the first suspect. NOT MEASURED: which value differs, and whether a player-facing build (step D's) can be in this state. Worth settling before step D publishes a build, because "offline" is exactly the mode a player uses with no chain behind the app.

Also seen, and harmless: with the app's node down, the APP's context logs `failed to fetch fee history` (`lib/core/connection/gasFee.ts`) every few seconds while a world is open; it is not the rejection's cause, which is the same with that node up.

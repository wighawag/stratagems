---
title: A welcome for a first-time player
type: idea
status: incubating
created: 2026-10-26
---

# A welcome for a first-time player

The legacy app opened with a welcome (`web/src/lib/stratagems/ui/tutorial/`, deleted in step 6c of `work/plans/join-template-commit-reveal.md`; at that step's parent commit, 54cafc4d) that introduced the game and pointed at missiv (messaging) and the claim link (gems). Step 6c dropped it (P4, the user's choice, 2026-10-26): both things it pointed at are gone (missiv until jolly-roger has a messaging layer, the claim link until step D decides how a live chain hands out gems), so a port would have said things that are no longer true.

What a new one would say: what a cycle is (plan, commit, reveal), what is at stake (the bond), how a cell lives and dies, and where to get gems on the deployment in hand. The template's setup gate already explains the stake and the browser key, so a welcome should not repeat those. Whether it is a framework piece (a game's first-visit screen, words supplied by the game) is the home test to ask first: reveal-or-die and bomber-world have no welcome either.

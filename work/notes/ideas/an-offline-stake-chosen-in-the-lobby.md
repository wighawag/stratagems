---
title: An offline stake chosen in the lobby
type: idea
status: incubating
created: 2026-10-26
---

# An offline stake chosen in the lobby

Stratagems' offline world stakes every seat one chunk of gems (32, `stakeAmount`) when it is provisioned (`web/src/lib/offline.ts`, P4 of step O in `work/plans/join-template-commit-reveal.md`). The user, deciding P4 on 2026-10-26: 32 is fine for now, and later the stake could be a lobby setting, beside how many sit at the table. It would be chosen before the world boots, for the same reason the table is: provisioning is what hands it out, once. The lobby is the template's (`$lib/game/lobby`) and byte-identical across games, so a setting there is framework work with a game-supplied range; the home test is the first question.

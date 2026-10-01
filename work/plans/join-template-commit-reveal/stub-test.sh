#!/usr/bin/env bash
# Compile the template's framework against a game that is not the reference game.
set -e
# Expects two worktrees of template-commit-reveal: proto/game-slot (with a
# generated web/src/lib/deployments.ts) and proto/stub-game. Then run
# `pnpm --filter ./web check` in proto/stub-game.
# DISCARDS every local change in proto/stub-game (checkout -f, clean): it is a
# throwaway worktree and must stay one.
HERE="$(cd "$(dirname "$0")" && pwd)"
W=~/dev/worktrees/template-commit-reveal/proto/stub-game
cd $W && git checkout -q -f --detach proto/game-slot && git clean -qfd web/src web/test
cd web
cp ../../game-slot/web/src/lib/deployments.ts src/lib/deployments.ts
git rm -rq src/lib/placement src/lib/offline.ts src/lib/offline-players.ts src/lib/offline-lobby.ts src/lib/offline-chrome.ts src/lib/ui/offline-world src/routes/offline src/routes/play src/routes/+page.svelte test/lib/placement test/lib/offline-players.test.ts test/lib/offline-lobby.test.ts test/lib/context/setup-gate.test.ts test/lib/context/resume-on-gas.test.ts
node -e "const fs=require('fs');const p='src/lib/deployments.ts';let s=fs.readFileSync(p,'utf8');s=s.replace('\"contracts\": {\n    \"Game\": {','\"contracts\": {\n    \"Stub\": {');fs.writeFileSync(p,s);"
mkdir -p src/lib/stub && cp "$HERE/stub-game.ts" src/lib/stub/game.ts
sed -i "s#\$game: 'src/lib/placement/game.ts',#\$game: 'src/lib/stub/game.ts',#" svelte.config.js

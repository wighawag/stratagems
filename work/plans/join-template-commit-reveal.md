# Plan: stratagems joins template-commit-reveal

Written 2026-09-30. One step per fresh agent context: each step below starts with what to read, says what to do and what "done" means, and ends by appending an entry to the **Progress log** at the bottom of this file and ticking its box. Do ONE step per context. The prompt to start a step is in the next section.

## The prompt for a step

Paste this into a fresh session, replacing `<N>` with the step number:

```
You are working in the stratagems repository, /home/wighawag/dev/github/wighawag/stratagems. Read work/plans/join-template-commit-reveal.md in full, then do STEP <N> of it and nothing else.

First:
1. Check `git status` in the main checkout is clean and `main` is up to date with origin. If not, stop and tell me.
2. Read the "Start here" block of step <N> and re-derive reality: this plan was written on 2026-09-30 and the numbers in it are measurements from that day. If a premise of the step no longer holds (a file moved, a version changed, the template changed), stop and tell me the discrepancy rather than building on it.
3. Check the Progress log: every step before <N> must be ticked. If not, stop and tell me.

Rules:
- Work in a git worktree under ~/dev/worktrees/stratagems/<branch> on a branch named in the step, never beside the repo, never directly on main.
- Commit in small steps on that branch. Do not push, open a PR, or touch main without asking me.
- Ask before any destructive command. Never `git stash` inside a conflicted merge.
- Bound every exploratory shell command with `timeout` and cap its output with `head`. Never grep node_modules, dist, .git or minified bundles, and never run an unbounded regex over a generated or minified file.
- Before starting anything on a port, check it is free (`ss -ltn`) and what holds it; 8545 and 8546 belong to another project. Stop every proxy, node, dev server and browser you start, by its process group, before you finish.
- Never write an em dash character, and do not hard-wrap Markdown prose.

When the step's acceptance criteria all hold, append a dated entry to the Progress log (what was done, the measurements, the commits, anything that surprised you), tick the step's box, and commit that too.

End with a report: what changed, the measurements against the step's acceptance criteria, anything you could not verify, and a `## Decisions` block for every non-obvious choice.
```

## Where things stand (2026-09-30)

- **stratagems** (`main` a7d0c5f, pushed): etherfold 0.11.0 indexer (`indexer/`, a worker in `web/`, verified against the alpha1 oracle), contracts on Hardhat 3.18 + hardhat-deploy 2.0.30 + rocketh 0.23.1, web on **Svelte 4** + SvelteKit 2.5 + Vite 5 + `web3-connection` + twgl.js, pnpm 9. Workspaces: `common`, `contracts`, `indexer`, `web`, `helper-services/{fuzd,missiv,secp256k1-db}`. Checks green: `svelte-check` 0 errors, contracts 69 tests pass (the ERC721 suite is skipped, as it always was), `pnpm format:check`.
- **template-commit-reveal** (`main` 2694b172, 2026-09-28): stems from jolly-roger `integration`; web on **Svelte 5** + SvelteKit 2.70 + Vite 8 + Tailwind 4 + TypeScript ~6.0 + vitest 4 + Playwright, `@etherplay/connect`; contracts on Hardhat ^3.13 + hardhat-deploy ^2.0.24 + rocketh ^0.19 (OLDER than stratagems'); pnpm 10.28.1 (`packageManager`); workspaces `web`, `contracts`. Its offshoot config: `main` (stemBranch `integration`), `with/pixi-js`, `with/nft-identity`, `with/all`; verify `pnpm install && pnpm --filter ./web check && pnpm --filter ./web run test:unit`.
- **The template's own plan already places stratagems** (template repo, `git show work:work/specs/proposed/games-on-this-foundation.md`, Decision 1): stratagems stems from `template-commit-reveal@main` as a **dormant, compile-only member** that supplies its own twgl render host, participates in `check` and not in e2e, and exists partly as a cheap test that the seams fit ("a cascade that breaks stratagems' build has found something"). The same document lists the port's real size: a Svelte 4 to 5 migration, a connection-library swap, a state-model swap, a renderer swap, each "about the size of the whole conquest graft".
- **Shared history: none.** stratagems was not cloned from the template. The way in is one merge with `--allow-unrelated-histories`, as mandalas did (`c96382d9`, 2026-08-02, "Merge jolly-roger template history into mandalas": no rewrite, every SHA stays), after which every template update is an ordinary three-way merge.

### A trial merge, measured 2026-09-30

In a throwaway clone (`git merge --no-commit --allow-unrelated-histories` of template `main` into stratagems `main`):

- **40 add/add conflicts**, every one a path both repos created independently: the root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitignore`, `README.md`; `dev/zellij*.kdl`; in `contracts/`: `package.json`, `hardhat.config.ts`, `rocketh/{config,deploy,environment}.ts`, `tsconfig.json`, `scripts/tsconfig.json`, `.env`, `.gitignore`, `.prettier*`, `remappings.txt`, `zellij.kdl`, and three Solidity files the template inherited from stratagems long ago (`src/game/internal/UsingVirtualTime.sol`, `src/utils/{PositionUtils,StringUtils}.sol`); in `web/`: `package.json`, `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `.env`, `.gitignore`, `.prettier*`, `README.md`, `src/app.{d.ts,html}`, `src/web-config.json`, `src/routes/+layout.{svelte,ts}`, `src/routes/+page.svelte`, `static/preview.png`.
- **668 files arrive cleanly**: the framework (`web/src/lib/core` 134, `shadcn` 104, `ui` 43, `game` 40, `context` 11, `embedded` 9, `account` 7, `kit` 6, ...), its unit tests (`web/test`, ~170, including the boundary tests), the reference game (`web/src/lib/placement`, `view`, `onchain`, routes `explorer`, `contracts`, `transactions`, `offline`, `debug`, `web/e2e`), and the template's reference CONTRACTS (`contracts/src/game/{interfaces,internal,routes}/Game*`, `src/tokens`, `deploy/*`, `test/js/*`, `js/*`).
- **Two folder names collide in `web/src/lib`**: stratagems has `account/` and `ui/`, and so does the template. Clean adds would interleave two apps' files in the same folders.

### What a game drops from this template

reveal-or-die, the one game fully on the template, is the reference (`git -C ../reveal-or-die show main:.offshoot-omissions`): it drops the reference game's client (`web/src/lib/placement`, its tests, `game.e2e.ts`, `out-of-gas.e2e.ts`), the token and stake-sale contracts and deploy scripts, and a few tests, and keeps the framework. Its own game lives in `web/src/lib/world`. stratagems, whose contracts share nothing with the reference game, drops more: ALL of the template's reference contracts, deploy scripts and contract tests (the template's own rule: contracts are not inherited by games), and, until it adopts the app context, the routes that need it.

## Decisions to confirm before step 4

These are recommendations. Step 4 must not start until the user has confirmed or changed them (record the answer here).

1. **Where stratagems' current app lives after the merge: `web/src/lib/stratagems/`**, moved there BEFORE the merge (step 2), so the template's `account/` and `ui/` land without interleaving, and so the port later dissolves one folder rather than untangling two. (reveal-or-die's game lives in `web/src/lib/world`; that name is taken by meaning, not by path.)
2. **The merge keeps stratagems' app shell** (its `+layout`, `+page`, `(pages)/`, routes) and the template's FRAMEWORK code and its unit tests, and omits the reference game (client and contracts) plus the template routes that need the template's app context. Those routes come back when the port adopts the app context (step 6). The alternative, taking the template's shell in the merge and mounting the game inside it, IS the port, and does not fit in one merge.
3. **Contracts toolchain versions: bump the template upstream first** (step U), so the merge's `contracts/package.json` and `rocketh/*` conflicts are about the game and not about versions. Without it, the merge takes stratagems' newer versions and every later cascade conflicts on them until the template catches up.
4. **The node's verify is the template's**: `pnpm install && pnpm --filter ./web check && pnpm --filter ./web run test:unit`, per the template's plan (check, not e2e). stratagems' own heavier checks (contracts tests, the alpha1 browser verification) stay stratagems' to run.

## Steps

- [ ] **Step 0**: baseline and measurement (read-only)
- [ ] **Step 1**: pnpm 10
- [ ] **Step 2**: stratagems' app moves to `web/src/lib/stratagems/`
- [ ] **Step 3**: the web toolchain the template runs on (Svelte 5 in legacy mode, SvelteKit, Vite 8, TypeScript 6)
- [ ] **Step U** (optional, in the template tree): rocketh 0.23 / hardhat-deploy 2.0.30 / Hardhat 3.18 at their home, cascaded
- [ ] **Step 4**: the merge
- [ ] **Step 5**: stratagems becomes a node of the tree
- [ ] **Later**: the port proper (steps 6 to 11, each specified in its own context when reached)

### Step 0: baseline and measurement (read-only)

**Start here.**

```sh
cd ~/dev/github/wighawag/stratagems && git log --oneline -3 && git status --short | head
git -C ../template-commit-reveal log --oneline -1 main
git -C ../template-commit-reveal show main:AGENTS.md | head -120
git -C ../template-commit-reveal show main:CONTEXT.md | head -80
git -C ../template-commit-reveal show work:work/specs/proposed/games-on-this-foundation.md | grep -n -i "stratagems\|Decision 1\|Decision 2" | head -40
git -C ../reveal-or-die show main:.offshoot-omissions | grep -v '^#' | grep -v '^$'
git -C ../template-commit-reveal show work:work/tasks/done/port-bomber-world-onto-reveal-or-die.md | head -120   # the closest precedent: a port with a trial merge
```

**Do.** No commits to code. Record, in the Progress log:

- the green baseline of stratagems `main`, each as a number: `pnpm install` (with the pnpm it uses today), `pnpm --filter ./web check`, `pnpm --filter ./contracts test`, `pnpm format:check`, `MODE=alpha1 pnpm --filter ./web build`;
- the template's baseline the same way, from a worktree of `template-commit-reveal@main` under `~/dev/worktrees/template-commit-reveal/<branch>`, since that is what step 4's result is judged against: `pnpm install`, `pnpm --filter ./web check`, `pnpm --filter ./web run test:unit` (its verify);
- the trial merge again (the numbers above may have moved): in a clone under `/tmp`, count the add/add conflicts and the clean adds by area, as the table above does. Remove the clone afterwards;
- which template files under `web/src/lib/{core,game,context,kit,embedded,account,ui}` import the reference game (`placement`, `view`, `onchain`, the `Game` deployment) or `$lib/deployments`, because those decide what compiles once the reference game is omitted. A list, with the import that ties each to the reference game.

**Done when** the Progress log holds all four measurements, dated.

### Step 1: pnpm 10

Branch `pnpm-10`.

**Start here.** Step 0's log entry. The template's root `package.json` (`packageManager: pnpm@10.28.1`, `pnpm.onlyBuiltDependencies`, `pnpm.overrides`). stratagems' root `package.json` has a `pnpm` field that pnpm 10+ no longer reads (`supportedArchitectures`, `overrides`, `auditConfig`: pnpm warns on every command), and `.github/workflows/{ipfs,github-pages}.yml` pin pnpm 9.

**Do.** `packageManager: "pnpm@10.28.1"`; move what the `pnpm` field still needs to where pnpm 10 reads it (`pnpm-workspace.yaml` settings); `onlyBuiltDependencies` for every package that genuinely needs its install script (pnpm 10 runs none by default: check `contracts` (hardhat, solc), `esbuild`, `better-sqlite3`/libsql if present, `helper-services/*`); CI workflows use the `packageManager` field and do NOT also set the setup action's `version:` (both at once fails with `ERR_PNPM_BAD_PM_VERSION`). Regenerate the lockfile.

**Done when** every baseline from step 0 is unchanged, `pnpm install` prints no ignored-field warning and no skipped build script that matters, and the `indexer:index` path still works (`pnpm indexer:build alpha1` at least; a full fold is not needed).

### Step 2: stratagems' app moves to `web/src/lib/stratagems/`

Branch `lib-stratagems`. Needs decision 1 confirmed.

**Start here.** `web/src/lib/` today holds `account actions blockchain config.ts render state ui`; `web/svelte.config.js` aliases `$data`, `$external`, `$utils`, `web-config`; `web/src/utils/` and `web/src/data/` are outside `lib`.

**Do.** `git mv` the whole of `web/src/lib/*` into `web/src/lib/stratagems/` (pure moves, so git tracks them as renames), then fix imports (`$lib/...` becomes `$lib/stratagems/...`). Nothing else: no refactor, no rename of anything else. Keep the commit a move plus import fixes so `git log --follow` works and the merge in step 4 sees renames.

**Done when** `svelte-check` 0 errors, the alpha1 build succeeds, `git show --stat` of the move commit reports renames (similarity 100% for most files), and the app starts under `vite dev` and draws the board (a manual or scripted look is enough; the full browser verification runs after step 3).

### Step 3: the web toolchain the template runs on

Branch `web-toolchain`. The largest risk before the merge, so it gets its own step and the full browser verification.

**Start here.** Template `web/package.json` versions (step 0 recorded them). Svelte 5 runs Svelte 4 syntax components in legacy mode, so this step does NOT rewrite components into runes; it moves the toolchain so the template's framework code can later compile beside them. `web3-connection@0.1.39` declares a Svelte 4 peer: check what it actually does under Svelte 5 before assuming it works.

**Do.** Svelte 5, `@sveltejs/kit` and `@sveltejs/vite-plugin-svelte` at the template's versions, Vite 8, `svelte-check` 4, TypeScript at the template's version (~6.0), `@sveltejs/adapter-static` compatible. Fix what breaks (`svelte-migrate` can help with mechanical changes, but read every change: logic must not move). Tailwind is NOT added here: it arrives with the template's framework in step 4.

**Done when**, all measured:

- `svelte-check` 0 errors, `pnpm format:check` green, `MODE=alpha1 pnpm --filter ./web build` succeeds;
- `pnpm --filter ./indexer compare:alpha1` still answers every question the same (the indexer is untouched, so this is a guard, not a test of this step);
- the real-Chromium verification passes: `MODE=alpha1 pnpm --filter ./web build`, then `VERIFY_ETH_NODE=http://127.0.0.1:<port> pnpm --filter ./web verify:alpha1` through the caching proxy (`indexer/oracle/2026-09-29-alpha1/README.md` says how; start it with `--cache ~/dev/github/wighawag/stratagems/indexer/data/rpc-cache` so a worktree uses the main checkout's cache, about an hour of RPC otherwise). Both tests: publication versus self-indexed (about 40 min) and the two-tab election;
- the app starts from the publication under `vite dev` too.

### Step U (optional): the contracts toolchain at its home, in the template tree

Needs decision 3 confirmed. Uses the `reconcile-template-tree` skill; this is template-tree work, not stratagems work, and changes other repos: ask before each push.

**Start here.** `offshoot-fanout status` for the tree that holds template-commit-reveal (find the root with `offshoot-fanout discover ~/dev/github/wighawag --remote stem`). Where is the contracts toolchain's home: `template-ethereum-contracts`, jolly-roger, or template-commit-reveal? (Both templates were on rocketh ^0.19 on 2026-09-30.)

**Do.** Bump hardhat to ^3.18, hardhat-deploy to ^2.0.30, rocketh to ^0.23.1 and the `@rocketh/*` packages to their latest at that home; apply what stratagems' migration found (commit 09a8ae6 and its message: `-e` not `-n` on the rocketh CLIs, `ChainInfo` no longer exported by `@rocketh/export`, the export writes `chain` instead of `chainId`/`genesisHash`/`chainInfo`, rocketh 0.23 refuses a chain-id mismatch outside a fork, the gas-estimate helpers are gone); cascade with `offshoot-fanout`, verify every node.

**Done when** the template's `contracts/package.json` carries the same versions as stratagems', every node of its subtree is green, and the user has approved the pushes.

### Step 4: the merge

Branch `join-template`, worktree `~/dev/worktrees/stratagems/join-template`. Needs decisions 1, 2 and 4 confirmed, steps 1 to 3 done (and U, or a recorded decision to skip it).

**Start here.** Step 0's measurements, especially the list of framework files tied to the reference game. The mandalas merge message (`git -C ../mandalas log -1 --format=%B c96382d9`) for the shape of the result and of the message. The bomber-world task's hazards (step 0 reads it). The template's `scripts/{apply-omissions.sh,check-omissions.mjs,check-dangling-imports.mjs}` and `web/test/offshoot-omissions.test.ts`, which arrive with the merge.

**Do.**

1. `git remote add stem git@github.com:wighawag/template-commit-reveal.git && git fetch stem --prune`, then `git merge --no-commit --allow-unrelated-histories stem/main`.
2. Resolve the 40 add/add conflicts BY INTENT, file by file, and read every result:
   - stratagems' side for its game and its shell: the three Solidity files (they compile into the deployed alpha1 bytecode), `+layout.*`, `+page.svelte`, `web-config.json`, `preview.png`, `app.html` unless the template's is needed by the framework, README (stratagems');
   - a real merge of both for configuration: root and package `package.json`s (scripts of both; stratagems' workspaces plus the template's; the template's framework dependencies, including Tailwind, next to stratagems'), `pnpm-workspace.yaml`, `svelte.config.js` (both alias sets; the template's `$ui` and friends), `vite.config.ts` and `vite.plugins.ts` (the template's `extraPlugins()` slot; stratagems' worker config), `tsconfig.json`s, `.gitignore`s, `.env`s, `.prettier*`, `hardhat.config.ts` and `rocketh/*` (stratagems' accounts, environments and tags; the template's shape);
   - the lockfile is never hand-merged: take either side and run `pnpm install`.
3. Omit what decision 2 says to omit, with `git rm`, and list EVERY omitted path in `.offshoot-omissions` with its reason (the template's format: a directory entry covers its contents; entries are stem-relative). At least: the template's reference contracts, deploy scripts, contract tests and `contracts/js` unless something kept needs it; `web/src/lib/placement` and whatever else step 0 found tied to the reference game; the routes that need the template's app context; the reference game's e2e and its fixtures. A framework file that fails to compile only because of the omitted reference game is a finding about the seam (the template's plan says exactly that is what this member is for): record it in the log and in the report, and resolve it the least invasive way (omit it, with a reason), never by editing framework files.
4. Run `node scripts/check-dangling-imports.mjs` once `package.json` resolves and installs, and `node scripts/check-omissions.mjs` (every absent stem path is listed).
5. The template's boundary tests (`web/test/*-boundary.test.ts`) will judge stratagems' legacy code by the template's conventions. Do not weaken them. Where one fails on stratagems' code, measure how many files and decide per test: exempt `web/src/lib/stratagems/` with a stated reason and an end date (the port), or fix. Record which.
6. Commit the merge with a message in the mandalas shape: why the histories are joined, what the template brings, what stratagems keeps, what is omitted and why, and what the merge fixed or found. `git log -1 --format='%h parents: %p'` must show two parents.

**Done when**, all measured, in the worktree:

- the node's verify passes: `pnpm install && pnpm --filter ./web check && pnpm --filter ./web run test:unit` (framework tests included);
- stratagems' own checks are what they were: contracts tests (69 pass), `pnpm format:check`, `MODE=alpha1 pnpm --filter ./web build`, `compare:alpha1`, and the real-Chromium `verify:alpha1` (both tests) plus the `vite dev` start;
- `check-omissions` and `check-dangling-imports` are clean, and `web/test/offshoot-omissions.test.ts` passes;
- the merge commit has two parents, and nothing in `web/src/lib/{core,game,kit}` differs from `stem/main` (`git diff --stat stem/main -- web/src/lib/core web/src/lib/game web/src/lib/kit` is empty), unless a difference is recorded as a finding with its reason.

Then ask the user before fast-forwarding `main` and pushing.

### Step 5: stratagems becomes a node of the tree

Branch `offshoot-node` (the config itself lives on an orphan branch). Uses the `reconcile-template-tree` skill.

**Start here.** `git -C ../reveal-or-die show offshoot:fanout.config.json` and `git -C ../bomber-world show offshoot:fanout.config.json` (the shape to copy). `offshoot-fanout config --help`.

**Do.**

1. The `stem` remote exists since step 4; confirm it points at `template-commit-reveal` and is fetched with `--prune`.
2. An orphan `offshoot` branch with `fanout.config.json`: `{"stem": "github:wighawag/template-commit-reveal", "branches": {"main": {"stemBranch": "main"}}, "verify": "pnpm install && pnpm --filter ./web check && pnpm --filter ./web run test:unit"}`, written with `offshoot-fanout config set` (plumbing; it never touches the working tree).
3. Read the `AGENTS.md` and `CONTEXT.md` that arrived with the merge, as stratagems: a paragraph written as "this repo" one level up may be false here, which has happened twice in this tree. Fix what is false for stratagems in stratagems' copy, and say in the log which paragraphs changed, since each is a future cascade conflict.
4. `offshoot-fanout status` (with `--registry` if the tree has one) must show stratagems as a node under `template-commit-reveal@main`, wired, with a clean dry-run.
5. Propose, do NOT make, the edit to the template's plan (`template-commit-reveal`, branch `work`, `work/specs/proposed/games-on-this-foundation.md`: the status table's stratagems row and Decision 1's "dormant, compile-only member"). That is another repo: show the user the text and ask.

**Done when** `offshoot-fanout --dry-run` from the template reaches stratagems and reports it clean or up to date, `offshoot-fanout --verify --dry-run` (or the verify command by hand in a fresh worktree) passes for the node, and the user has approved pushing `main` and the `offshoot` branch.

### Later: the port proper (not specified yet)

Each of these is its own step and gets its own detailed specification, in its own context, when it is reached, like the bomber-world task in the template repo. They are listed here so the order is decided once. The template's plan (`games-on-this-foundation.md`) and `AGENTS.md` are the authority on every seam named here.

- **Step 6, the app shell and the connection.** Adopt the template's app context and `@etherplay/connect` in place of `web3-connection`; the omitted template routes (explorer, contracts, transactions, offline, debug) come back; their `.offshoot-omissions` entries go.
- **Step 7, the clock.** `web/src/lib/stratagems/state/Epoch.ts` onto `game/core` (cycle, phase, chain time), and the vocabulary: stratagems says `epoch` and renames TWICE, its contracts and its 700-line TypeScript reimplementation of them in `common/` (the template's backlog task `vocabulary-in-the-game-repos` says so, and says the rename belongs inside the port, not in a pass of its own).
- **Step 8, commit and reveal.** Onto the submission, secret and recovery seams; fuzd's automatic reveal through the seam, not beside it.
- **Step 9, the renderer.** twgl.js as stratagems' own render host behind the template's render seam (the template's plan: stratagems "supplies its own third host").
- **Step 10, the contracts.** The template's commit-reveal mechanism where stratagems' contracts differ (the commitment as a hash chain of chunks, the cycle policy, the vocabulary). This means a NEW deployment: alpha1 is discontinued and stays as history, its oracle and publication with it.
- **Step 11, Svelte conventions.** Components out of legacy mode, logic out of `.svelte` files into `.ts` stores, per `AGENTS.md`; the step-4 boundary-test exemptions end here.

## Progress log

(Each step appends a dated entry here and ticks its box above.)

# Plan: stratagems joins template-commit-reveal

Written 2026-09-30. One step per fresh agent context: each step below starts with what to read, says what to do and what "done" means, and ends by appending an entry to the **Progress log** at the bottom of this file and ticking its box. Do ONE step per context. The prompt that starts a step is in the next section, and it is the same prompt every time.

## Branches

**`main` stays untouched until the whole join is good** (the user, 2026-10-01). The plan and every step's work live on the integration branch **`join-template-commit-reveal`**, pushed to origin, which no worktree checks out. Each step branches from it into its own worktree, and when its acceptance criteria hold, fast-forwards the integration branch to its step branch. So the live copy of this file is `git show join-template-commit-reveal:work/plans/join-template-commit-reveal.md`, and the copy on `main` is stale by design. Every step pushes the integration branch to origin when it lands (the user, 2026-10-01), so origin's copy is the authority and a session on another machine starts from it. Nothing else is pushed without asking, in any repo. Merging the integration branch into `main` is the user's call, at the end (step 4 and step 5 say where).

## The prompt for a step

Paste this into a fresh session as it is. It picks the next step itself. To run a different step (for example U2 in parallel with steps 1 to 3), add one line after it: `Do step U2.`

```
You are working in the stratagems repository, /home/wighawag/dev/github/wighawag/stratagems, on the plan in work/plans/join-template-commit-reveal.md. The live copy of the plan is on the integration branch `join-template-commit-reveal`, NOT on main. Fetch first (`git -C ~/dev/github/wighawag/stratagems fetch origin --prune`), make sure the local branch is not behind `origin/join-template-commit-reveal` (fast-forward it with `git fetch origin join-template-commit-reveal:join-template-commit-reveal` if it is, or create it from there if it is missing), then read the plan in full with `git -C ~/dev/github/wighawag/stratagems show join-template-commit-reveal:work/plans/join-template-commit-reveal.md`.

Which step: if my message after this prompt names a step, do that one. Otherwise do the first step whose box is unticked in the plan's Steps list. If that is the "Later" entry, stop: the port's next step has to be specified first, so tell me and propose its specification instead. Do ONE step and nothing else.

First:
1. Check that the main checkout is clean (`git status`), that `main` is up to date with origin, and that the integration branch exists and contains origin/main (`git merge-base --is-ancestor origin/main join-template-commit-reveal`). If not, stop and tell me.
2. Read the step's "Start here" block and re-derive reality: the numbers in the plan are measurements from the day they were written. If a premise of the step no longer holds (a file moved, a version changed, the template changed), stop and tell me the discrepancy rather than building on it.
3. Check that every step the chosen step needs is ticked: what its own text says it needs, and otherwise every step above it in the Steps list. If not, stop and tell me.

Rules:
- Work in a git worktree under ~/dev/worktrees/<repo>/<branch>, never beside a repo. In stratagems, branch from `join-template-commit-reveal`, on the branch the step names, or `step-<id>` if it names none. Never commit to main or to the integration branch directly.
- Commit in small steps. The only push you make without asking is the integration branch, at the end (below). Push nothing else, in any repo, and do not open a PR or touch main without asking me. A step that works in another repo (the template tree) follows that repo's own AGENTS.md and work protocol there.
- Ask before any destructive command. Never `git stash` inside a conflicted merge.
- Bound every exploratory shell command with `timeout` and cap its output with `head`. Never grep node_modules, dist, .git or minified bundles, and never run an unbounded regex over a generated or minified file.
- Before starting anything on a port, check it is free (`ss -ltn`) and what holds it; 8545 and 8546 belong to another project. Stop every proxy, node, dev server and browser you start, by its process group, before you finish.
- Never write an em dash character, and do not hard-wrap Markdown prose.

When the step's acceptance criteria all hold: append a dated entry to the Progress log (what was done, the measurements, the commits, anything that surprised you), tick the step's box, commit, then land it: fetch origin and bring the local integration branch up to `origin/join-template-commit-reveal` as in the first paragraph, fast-forward it to your step branch with `git -C ~/dev/github/wighawag/stratagems fetch . <step-branch>:join-template-commit-reveal`, and push it with `git -C ~/dev/github/wighawag/stratagems push origin join-template-commit-reveal`. Both only ever fast-forward. If either refuses because another step landed first, rebase your step branch onto the integration branch keeping both log entries, and try again; never force. If the criteria do not all hold, do not tick and do not fast-forward: say what is missing.

End with a report: what changed, the measurements against the step's acceptance criteria, anything you could not verify, a `## Decisions` block for every non-obvious choice, and which step comes next. If what you learned changes the order or the content of later steps, fix the Steps list and the step's text in the plan, and if it changes how a session must start or finish, fix this prompt there too (it must stay paste-as-is, with nothing to fill in), and say what you changed. The next session gets this same prompt, unchanged.
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

## The direction (the user, 2026-09-30)

**stratagems ends up as a small addition on the template, not as a second app beside it.** It uses the template's systems (app context, connection, clock, submission and recovery, render seam, contracts), and where stratagems needs something the template lacks, that feature is built IN THE TEMPLATE TREE, at its home, and arrives by cascade, rather than being kept in stratagems. So every port step (6 onwards) begins with the `reconcile-template-tree` skill's home test: would a sibling game want this? If yes, it lands upstream first (in the template repo, following that repo's own work protocol, with the user's approval), and the stratagems step then consumes it. What stays in stratagems is its game: the rules, its contracts' game logic, its renderer, its brand.

Candidates already visible, each to be judged when its step comes (not decided here):

- **The commit-reveal contracts as a reusable base** (decision 5 below): the template's `UsingGameInternal` mixes the mechanism (reserve, commitment, hash chain of chunks, cycle policy, advance, forfeit, delegation) with its reference game (`_place`, `Placement[]` in `reveal`), so no game can build on it yet.
- **An indexed state layer** (stratagems' etherfold indexer and `StateFollower`): the template's plan already says the layer a game needs tracks its cycle length, and that a 24-hour game wants an indexer while a fast one reads logs, which makes it a candidate layer rather than stratagems-only code.
- **Automatic reveal through fuzd**, and **missiv** messaging: jolly-roger's service layers (`with/*`) are where the template's plan puts such services.
- **A client-side simulation of the contract** (stratagems' 700-line TypeScript reimplementation in `common/`; catacombs does the same with a local EVM): the template's plan notes both, so the seam for it may belong upstream.

## Decisions (confirmed by the user, 2026-09-30)

1. **Where stratagems' current app lives after the merge: `web/src/lib/stratagems/`**, moved there BEFORE the merge (step 2), so the template's `account/` and `ui/` land without interleaving, and so the port later dissolves one folder rather than untangling two. (reveal-or-die's game lives in `web/src/lib/world`; that name is taken by meaning, not by path.)
2. **The merge keeps stratagems' app shell** (its `+layout`, `+page`, `(pages)/`, routes) and the template's FRAMEWORK code and its unit tests, and omits the reference game (client and contracts) plus the template routes that need the template's app context. Those routes come back when the port adopts the app context (step 6). The alternative, taking the template's shell in the merge and mounting the game inside it, IS the port, and does not fit in one merge. **Confirmed, as a transition only**: the port then moves stratagems onto the template's system (see "The direction").
3. **Contracts toolchain versions: bump the template upstream first** (step U), so the merge's `contracts/package.json` and `rocketh/*` conflicts are about the game and not about versions. Without it, the merge takes stratagems' newer versions and every later cascade conflicts on them until the template catches up.
4. **The node's verify is the template's**: `pnpm install && pnpm --filter ./web check && pnpm --filter ./web run test:unit`, per the template's plan (check, not e2e). stratagems' own heavier checks (contracts tests, the alpha1 browser verification) stay stratagems' to run.
5. **The merge keeps stratagems' contracts; later, stratagems' contracts are rebuilt on the template's commit-reveal system.** At the merge the template's reference contracts, their deploy scripts and tests are omitted (they are a reference GAME today, and would deploy a second game beside stratagems'). Step 10 then happens in two parts: first, upstream, the template separates its commit-reveal mechanism into a game-agnostic base that a game extends with its own action type and resolution hook (the reference game becomes its first user); then stratagems un-omits that base and rebuilds its game logic on it. That is a new deployment; alpha1 stays as history.

## Steps

- [x] **Step 0**: baseline and measurement (read-only)
- [x] **Step 1**: pnpm 10
- [x] **Step 2**: stratagems' app moves to `web/src/lib/stratagems/`
- [ ] **Step 3**: the web toolchain the template runs on (Svelte 5 in legacy mode, SvelteKit, Vite 8, TypeScript 6)
- [ ] **Step U** (optional, in the template tree): rocketh 0.23 / hardhat-deploy 2.0.30 / Hardhat 3.18 at their home, cascaded
- [ ] **Step U2** (in the template tree): the game becomes a slot the framework compiles against, and the delegation registration is typed
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
3. Omit what decision 2 says to omit, with `git rm`, and list EVERY omitted path in `.offshoot-omissions` with its reason (the template's format: a directory entry covers its contents; entries are stem-relative). At least: the template's reference contracts, deploy scripts, contract tests and `contracts/js` unless something kept needs it (decision 5: their reason says they are omitted UNTIL step 10b rebuilds stratagems on the template's commit-reveal base, so nobody reads the entry as a permanent choice); `web/src/lib/placement` and whatever else step 0 found tied to the reference game; the routes that need the template's app context; the reference game's e2e and its fixtures. A framework file that fails to compile only because of the omitted reference game is a finding about the seam (the template's plan says exactly that is what this member is for): record it in the log and in the report, and resolve it the least invasive way (omit it, with a reason), never by editing framework files.
4. Run `node scripts/check-dangling-imports.mjs` once `package.json` resolves and installs, and `node scripts/check-omissions.mjs` (every absent stem path is listed).
5. The template's boundary tests (`web/test/*-boundary.test.ts`) will judge stratagems' legacy code by the template's conventions. Do not weaken them. Where one fails on stratagems' code, measure how many files and decide per test: exempt `web/src/lib/stratagems/` with a stated reason and an end date (the port), or fix. Record which.
6. Commit the merge with a message in the mandalas shape: why the histories are joined, what the template brings, what stratagems keeps, what is omitted and why, and what the merge fixed or found. `git log -1 --format='%h parents: %p'` must show two parents.

**Done when**, all measured, in the worktree:

- the node's verify passes: `pnpm install && pnpm --filter ./web check && pnpm --filter ./web run test:unit` (framework tests included);
- stratagems' own checks are what they were: contracts tests (69 pass; run them as `CI=1 pnpm --filter ./contracts test`, or vitest stays in watch mode after passing and never exits), `pnpm format:check`, `MODE=alpha1 pnpm --filter ./web build`, `compare:alpha1`, and the real-Chromium `verify:alpha1` (both tests) plus the `vite dev` start;
- `check-omissions` and `check-dangling-imports` are clean, and `web/test/offshoot-omissions.test.ts` passes;
- the merge commit has two parents, and nothing in `web/src/lib/{core,game,kit}` differs from `stem/main` (`git diff --stat stem/main -- web/src/lib/core web/src/lib/game web/src/lib/kit` is empty), unless a difference is recorded as a finding with its reason.

Then ask the user before merging anything into `main` and pushing: the integration branch (see "Branches") is what carries the result until then.

**If step U2 has landed, step 4 changes** (re-derive this in step 4's own context; it is a prediction from the prototype, not a measurement on stratagems): stratagems does not omit the framework files that read the app context, because they no longer reach the reference game. It supplies its own game module (for example `web/src/lib/stratagems/game.ts`, exporting what the template's game module exports: `createGameContext`, `SIGNER_GRANT`, `GameMembers`, `delegationRegistry`, `operationScope`, `startDiagnostics`) and points the `$game` alias at it, in `svelte.config.js`, which step 4 merges by hand anyway. Before the port that module is the stub's shape: an `onchainState` with `update` and `status`, no submission, and contract functions that name `Stratagems` and compile but never run, because stratagems' shell does not mount the template's context until step 6. What it still omits is the reference game itself (`placement/`, the offline world, `routes/{play,offline}`, the template's `+page.svelte`) and the tests that test the reference game's fixtures or guard the framework's use (`test/lib/embedded/{world,deployments}.test.ts`, `test/lib/game/render/canvas2d.svelte.test.ts`, `test/identity-boundary.test.ts` until step 8, `test/render-host-boundary.test.ts` until step 9), each with its reason.

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

### Step U2: the game becomes a slot, and the delegation registration is typed

In the template tree, so it follows `reconcile-template-tree` and each repo's own work protocol, and every push is asked for. Needs step 0's finding 4 (and the 2026-10-01 log entry, which is the measurement and the prototype). Does NOT need steps 1 to 3, and can run in parallel with them.

**Why.** Step 0 measured that the reference game reaches 65 of the template's 240 framework files, nearly all through the app context: `context/types.ts` names the game's types, and `context/game.ts` is the reference game's composition, which every game rewrites (reveal-or-die: 992 changed lines against `with/all`, about 620 of them comments). A game that is not a variant of the reference game, which stratagems is the first of, cannot compile the framework without editing it. The home test answers yes: reveal-or-die and bomber-world conflict on those files on every cascade.

**Start here.** The prototype: template-commit-reveal branch `proto/game-slot` (4 commits on `main` b4d101ba, pushed to origin 2026-10-01 at 4e1ee404, worktree `~/dev/worktrees/template-commit-reveal/proto/game-slot`), and `/tmp/stub-test.sh` with `/tmp/stub-game.ts` if they still exist (the log entry describes both, so they can be rebuilt). Then `git diff stem/integration main -- web/src/lib/context web/src/lib/ui/delegation web/src/lib/ui/credits/top-up-flow.ts` in the template: what is already jolly-roger's.

**Do**, as separate changes, each at its home:

1. **The delegation registration is typed** (home: jolly-roger, where `ui/delegation/{register-delegate,registration}.ts` and `ui/credits/top-up-flow.ts` live byte-identical or nearly; the template's `game/acquire/{acquire,authorise}.ts` follow by cascade plus a template commit). `RegistrationRequest` becomes a union per entry point with `args: ContractFunctionArgs<typeof DELEGATION_ABI, 'payable', F>`; `submitRegistration` and its `Writer` take `abi: typeof DELEGATION_ABI`; the three `as unknown as RegistrationWriter` casts go, because viem's tracked client is assignable to the typed writer as it is. Callers pass `delegation.registry`, never a contract's own ABI. Prototype commit d3df3490.
2. **The app is a slot, and core names no app type** (home: jolly-roger, whose `core.ts` already has `AppContext = {onchainState: Context['onchainState'], ...}`): `Context = CoreContext & AppMembers`, with `AppMembers` taken from ONE app-owned module through an alias, the way `$ui` already works (`svelte.config.js`); `AppContext` states the requirement (`onchainState: {update(): Promise<unknown>; status: Readable<PollingStatus>}`, `start?`) instead of naming the app's store; `createCoreContext` returns `CoreContext & Omit<App, 'start'>`, built by spreading the app's members whole (spreading a generic rest and putting one member back does not type-check). The alias name is jolly-roger's to choose (its app is not a game; the prototype calls it `$game`). Prototype commits d1416564 and 5accc66b.
3. **The reference game moves behind the slot** (home: template-commit-reveal): `context/game.ts` to `placement/context.ts`, `debug/diagnostics.ts` to `placement/diagnostics.ts`, and a `placement/game.ts` that declares the game to the framework: `createGameContext`, `SIGNER_GRANT`, `GameMembers`, `startDiagnostics`, and the two contract choices as FUNCTIONS of `TypedDeployments` (`delegationRegistry`, `operationScope`), not names, so naming a contract the deployment lacks is a compile error in the game. `game/acquire/acquire.ts` reads the address and chain from `deps.delegation.registry`; the poller (`onchain/state.ts`) takes `cycleDuration` instead of casting `contracts.Game.linkedData`, and loses its `deployments` parameter. Prototype commits d1416564 and 4e1ee404.
4. **Cascade** to reveal-or-die and bomber-world: their `context/game.ts` moves into `world/` the same way, and their `.offshoot-omissions` gains nothing new. This is where the cost lands, and it is a RENAME of their most conflicted file: plan it with the template's maintainer, do not discover it during a cascade.
5. **NOT in this step, and named so it is not forgotten:** extracting the commit-reveal skeleton that every game repeats (chain time, cycle trackers, advance, submission, recovery, held board, setup gate, `start()`'s re-check wiring: about 300 code lines, 123 of the body's 183 unchanged in reveal-or-die) into a framework function in `game/core/`. That is what makes step 6 "supply the game's parts" rather than "write a 900-line composition", so it belongs before step 6, as its own upstream step.

**Done when**, all measured: the template's verify green with unchanged counts; the three teeth from the log (a `number` deadline, a dropped argument, `Game.abi` as the registry) each fail `check`; the stub test passes: in a throwaway worktree of the template, the reference game removed, `Game` renamed in `deployments.ts`, `$game` pointed at a stub with no contract named `Game`, and `check` reports 0 errors in `web/src` (the prototype: 0); every node of the subtree is green after the cascade; the user has approved every push.

**What this step decides about delegation.** The framework stays delegation-only: `delegationRegistry` returns an address, it is not optional. stratagems gets delegation when step 10b rebuilds it on the template's commit-reveal contracts, which include `UsingDelegation` (the user, 2026-10-01: the port adopts the template's commit-reveal system). Until then its `delegationRegistry` names a contract that compiles and never runs, which holds only while stratagems' shell does not mount the template's context. **So step 6 (adopting the app context and connection) depends on 10b, or on delegation reaching stratagems' contracts some other way first.** The order of steps 6 to 11 is reopened by this; decide it when step 6 is specified.

### Later: the port proper (not specified yet)

Each of these is its own step and gets its own detailed specification, in its own context, when it is reached, like the bomber-world task in the template repo. They are listed here so the order is decided once. The template's plan (`games-on-this-foundation.md`) and `AGENTS.md` are the authority on every seam named here.

Every step below starts with the home test from "The direction": what it needs from the template that the template does not have yet is built there first.

- **Step 6, the app shell and the connection.** Adopt the template's app context and `@etherplay/connect` in place of `web3-connection`; the omitted template routes (explorer, contracts, transactions, offline, debug) come back; their `.offshoot-omissions` entries go.
- **Step 7, the clock.** `web/src/lib/stratagems/state/Epoch.ts` onto `game/core` (cycle, phase, chain time), and the vocabulary: stratagems says `epoch` and renames TWICE, its contracts and its 700-line TypeScript reimplementation of them in `common/` (the template's backlog task `vocabulary-in-the-game-repos` says so, and says the rename belongs inside the port, not in a pass of its own).
- **Step 8, commit and reveal.** Onto the submission, secret and recovery seams; fuzd's automatic reveal through the seam, not beside it (and, if a sibling would want automatic reveal, as a service layer upstream).
- **Step 9, the renderer.** twgl.js as stratagems' own render host behind the template's render seam (the template's plan: stratagems "supplies its own third host").
- **Step 10a, upstream: the commit-reveal base.** In the template repo, following its own work protocol: separate the mechanism in `UsingGameInternal` (reserve, commitment, hash chain of chunks, cycle policy, advance, forfeit, delegation, attendance) from the reference game's placement rules, behind a game-agnostic action type and a resolution hook; the reference game becomes the first user, reveal-or-die (and bomber-world by cascade) the second, which is the test that the base is really generic. A decision for the template's maintainer, so it is proposed there as a spec, not done from here.
- **Step 10b, the contracts.** stratagems un-omits the base (its `.offshoot-omissions` entries go) and rebuilds its game on it: its placement, life, delta and reward rules become the resolution hook; its reserve, commitment and epoch code go, replaced by the base's (with the vocabulary, decision 5 and step 7). The TypeScript reimplementation in `common/` follows. This means a NEW deployment: alpha1 is discontinued and stays as history, its oracle and publication with it.
- **Step 11, Svelte conventions.** Components out of legacy mode, logic out of `.svelte` files into `.ts` stores, per `AGENTS.md`; the step-4 boundary-test exemptions end here.

## Progress log

(Each step appends a dated entry here and ticks its box above.)

### 2026-09-30, step 0: baseline and measurement

Measured against stratagems `main` fddf3cd (a7d0c5f plus the two commits of this plan, nothing else) and template-commit-reveal `main` 2694b172, both unchanged since the plan was written. Worktrees: `~/dev/worktrees/stratagems/join-template-step-0` (branch `join-template-step-0`, only this log entry on it) and `~/dev/worktrees/template-commit-reveal/step0-baseline` (detached at 2694b172, kept for step 4 to compare against; nothing written to it but build output and the generated `web/src/lib/deployments.ts`, both gitignored). Node v24.19.0.

**1. stratagems baseline (green, with two caveats about HOW).**

| check                                             | result                                                                                          | time |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| `pnpm install --frozen-lockfile` with pnpm 9.15.9 | exit 0, 1241 packages, no warning; contracts `prepare` compiles 27 Solidity files (solc 0.8.24) | 13 s |
| `pnpm indexer:build alpha1` (see caveat b)        | exit 0                                                                                          | 5 s  |
| `pnpm --filter ./web check`                       | svelte-check 0 errors, 0 warnings                                                               | 6 s  |
| `pnpm --filter ./contracts test`                  | 6 files pass, 1 skipped; 69 tests pass, 67 skipped (136)                                        | 65 s |
| `pnpm format:check`                               | clean, root and all 7 packages                                                                  | 4 s  |
| `MODE=alpha1 pnpm --filter ./web build`           | exit 0, no `(!)` warning, `web/build` 14 MB, 102 files                                          | 14 s |

Caveat a, **which pnpm "it uses today"**: the repo has no `packageManager`, so a shell here gets the system pnpm, **11.25.0**, and that one cannot install the committed lockfile at all. It fails twice over: `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` (pnpm 11 defaults to a one-day `minimumReleaseAge`, and etherfold 0.11.0 with its 13 `@etherfold/*` packages and rocketh 0.23.1 were published on 2026-09-30), and with the age check disabled, `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`, because the lockfile records the `overrides` that pnpm 11 no longer reads from `package.json`. CI pins pnpm 9, and pnpm 9 installs the lockfile frozen and cleanly, so the baseline above is pnpm 9 (`npx pnpm@9`). The age failure disappears on its own tomorrow; the overrides one is step 1's job. Step 1 should also know: the system pnpm 11 honours `packageManager` and switched to 10.28.1 in the template's worktree (after warning that the template's own `package.json` still has a `pnpm` field with `onlyBuiltDependencies` and `overrides`, which pnpm 11 ignores).

Caveat b, **`check` is only 0 errors after a bootstrap**: straight after install it reports 32 errors in 19 files, all of them `Cannot find module 'stratagems-common'`/`'stratagems-indexer'`/`'$data/contracts'` and the `unknown`/implicit-`any` types that follow from them. Those are two workspace packages whose `dist/` is not built by install, and a generated file. `pnpm indexer:build alpha1` (contracts export, then the `common` and `indexer` builds) produces all three, and then `check` is 0. So the plan's "0 errors" holds, but only in a tree where that has been run; a fresh worktree needs it, and step 4's verify (`pnpm install && pnpm --filter ./web check && ...`) will hit exactly this, see finding 4 below.

**2. template baseline (its verify, green, with one caveat).** With pnpm 10.28.1 (its `packageManager`):

| check                               | result                                                                           | time |
| ----------------------------------- | -------------------------------------------------------------------------------- | ---- |
| `pnpm install --frozen-lockfile`    | exit 0, 481 packages added; warns "Ignored build scripts: @parcel/watcher@2.6.0" | 6 s  |
| `pnpm --filter ./web check`         | svelte-check 0 errors, 0 warnings (see caveat)                                   | 9 s  |
| `pnpm --filter ./web run test:unit` | server: 148 files, 1697 tests pass; client: 13 files, 76 tests pass              | 16 s |

Caveat: the first `check` in the fresh worktree reported **31 errors in 13 files** (19 viem client-type mismatches, 6 `'contract' is of type 'unknown'`, 3 `Cannot find module '$lib/deployments'`, 3 more of the viem kind). Cause: the install did not generate `web/src/lib/deployments.ts`. The root `prepare` (`scripts/ensure-deployments.mjs`) ran alongside `contracts prepare` (the compile), found no committed records, and its throwaway deploy failed; it said so and let the install succeed, as designed. Running `node scripts/ensure-deployments.mjs` again after the install generated the file from the throwaway deploy, and `check` was 0. Likely an ordering race between the two `prepare` scripts on a fresh clone; observed once, not reproduced or diagnosed further (it is the template's, not this plan's). It matters here because the node's verify runs in a fresh worktree.

Template versions, for step 3 and U: web `svelte ^5.56.9`, `@sveltejs/kit ^2.70.3`, `@sveltejs/vite-plugin-svelte ^7.3.0`, `@sveltejs/adapter-static ^3.0.10`, `vite ^8.2.1`, `svelte-check ^4.7.6`, `typescript ~6.0.3`, `tailwindcss ^4.3.3`, `vitest ^4.1.11`, `@playwright/test ^1.62.1`, `@etherplay/connect ^0.14.0`, `viem ^2.55.19`, `@rocketh/web ^0.19.23`. Contracts `hardhat ^3.13.0`, `hardhat-deploy ^2.0.24`, `rocketh ^0.19.19`, `@rocketh/*` ^0.19.12 to ^0.19.23, `typescript ~6.0.3`. stratagems today: web `svelte ^4.2.18`, kit `^2.5.10`, vite-plugin-svelte `^3.1.1`, adapter-static `^3.0.0`, vite `^5.2.13`, svelte-check `^3.8.0`, typescript `^5.4.5`, viem `^2.13.7`, `web3-connection ^0.1.39`; contracts `hardhat ^3.18.0`, `hardhat-deploy ^2.0.30`, `rocketh ^0.23.1`, viem `^2.57.1`, vitest `^1.6.0`.

**3. the trial merge, again: unchanged.** Fresh clone under `/tmp`, `git merge --no-commit --allow-unrelated-histories stem/main` (2694b172): **40 conflicts, all add/add**, and exactly the plan's list (its `.prettier*` and `dev/zellij*.kdl` expand to `contracts/.prettier{ignore,rc}`, `web/.prettier{ignore,rc}`, `dev/zellij{,-attach,-remote-chain}.kdl`). **668 clean adds**, by area:

| area                       | files | area                                                                                                                                         | files |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `web/test`                 | 171   | `web/src/lib/core`                                                                                                                           | 134   |
| `web/src/lib/shadcn`       | 104   | `web/src/lib/ui`                                                                                                                             | 43    |
| `web/src/lib/game`         | 40    | `web/src/lib/placement`                                                                                                                      | 20    |
| `web/e2e`                  | 20    | `web/src/routes/explorer`                                                                                                                    | 19    |
| `contracts/src`            | 12    | `web/src/lib/context`                                                                                                                        | 11    |
| `web/src/lib/embedded`     | 9     | `web/static`                                                                                                                                 | 8     |
| `web/src/lib/account`      | 7     | `contracts/test`                                                                                                                             | 6     |
| `scripts`                  | 6     | `web/src/lib/kit`                                                                                                                            | 6     |
| `web/src/routes/contracts` | 5     | `contracts/deploy`                                                                                                                           | 3     |
| `web/src/lib/debug`        | 3     | 2 each: `contracts/js`, `contracts/scripts`, `web/src/lib/{metadata,onchain,view}`, `web/src/routes/{debug,offline,transactions}`, `web/src` |       |

and one each: `AGENTS.md`, `CONTEXT.md`, `.offshoot-omissions`, `README.embedded-chain.md`, `README.integration.md`, `contracts/slippy.config.js`, `web/{components.json,.env.localhost,.npmrc,playwright.config.ts,TESTING.md,vite.plugins.ts}`, `web/src/lib/{components,icons}`, `web/src/lib/{deployments-store,dev-accounts,index,offline,offline-chrome,offline-lobby,offline-players}.ts`, `web/src/routes/{+error.svelte,play}`. The template's reference contracts that arrive: `src/game/{interfaces,internal,routes}` (9 files), `src/tokens/{GameToken,StakeSale}.sol`, `deploy/{001_deploy_token,010_deploy_game,020_deploy_stake_sale}.ts`, `test/js/{CyclePolicy,Game,GasBudget,StakeSale}.test.ts` plus `utils/index.ts` and a `tsconfig.json`, `js/{index,positions}.ts`, `scripts/{deploy-ephemeral,findError}.ts`. The `account/` and `ui/` collision: stratagems has 65 files there, the template 50, no path in common, so they would interleave exactly as the plan says. The clone was removed.

**4. which framework files tie to the reference game.** An import graph over `web/src/lib` of the template (every `import`/`export ... from`/`import()` resolved through `$lib` and relative paths), for the 240 files under `core game context kit embedded account ui`. "Reference game" = `placement/`, `view/index.ts`, `onchain/state.ts`. (`view/operation.ts` and `onchain/delegation.ts` are NOT the reference game: they are generic operation display and `@etherplay/connect` delegation, reveal-or-die keeps both unchanged, and they are imported by 7 and 6 framework files respectively.)

- **Direct imports, 2 files, both in `context/`:**
  - `context/game.ts`: `$lib/onchain/state`, `$lib/view`, and 15 `$lib/placement/*` modules (`config`, `commit-reveal`, `storage`, `planning`, `cycle`, `advance`, `hold`, `display-plan`, `errors`, `reserve`, `acquisition`, `missed-reveal`, `state`, `view`, `render`, `cells`). This IS the reference game's composition.
  - `context/types.ts`: `import type` of `OnchainStateStore` (`$lib/onchain/state`), `ViewStateStore` (`$lib/view`), `BoardState` (`$lib/placement/state`), `BoardView` (`$lib/placement/view`), and `Game, Render` from `./game`.
- **Transitively, 63 more** (core 11, game 5, context 6, kit 1, embedded 2, account 6, ui 32), nearly all through two hubs: `context/types.ts`, reached directly or via `$lib` (`index.ts`) or `account/AccountData.ts`; and `context/index.ts` -> `context/game.ts` (the path for `embedded/{world,index}.ts`). Two go through `offline.ts` -> `placement/config.ts` instead: `ui/offline-world/OfflineWorld{Bar,Navbar}.svelte`. The 63 are: `account/{AccountData,connectors,operation-intent,operations-migration,recorded-nonces,toastConnector}.ts`; `context/{AcrossPages,Context,InWorld}.svelte`, `context/{core,index,sender-registry}.ts`; `core/connection/{ConnectionFlow.svelte,executor.ts,senders.ts}`, `core/transaction/{AccountCannotSend,ErrorDetails,InFlightRequests,InsufficientFunds}Modal.svelte`, `core/ui/confirm/ConfirmationModal.svelte`, `core/ui/faucet/{FaucetButton.svelte,faucet-actions.ts,index.ts}`; `embedded/{index,world}.ts`; `game/acquire/{AcquireModal.svelte,acquire.ts,authorise.ts,index.ts,pending.ts}`; `kit/KitNavigation.svelte`; `ui/chrome.ts`, `ui/credits/*` (7), `ui/debug/*` (3), `ui/delegation/*` (5), `ui/in-flight/SendingBar.svelte`, `ui/navbar/*` (2), `ui/nonce-cache/NonceCacheBanner.svelte`, `ui/offline/OfflineBanner.svelte`, `ui/offline-world/*` (2), `ui/pending-operation/*` (8), `ui/rpc-health/RpcHealthBanner.svelte`.
- **Independent: 175** (core 118, game 33, context 3, kit 4, embedded 6, account 1, ui 10).
- **The `Game` deployment by name**, a tie that survives even if `placement/` stayed: `deployments.contracts.Game` in `context/config.ts:87`, `context/core.ts:1212`, `context/game.ts` (2), `game/acquire/acquire.ts` (4), and `onchain/state.ts:206`. stratagems' contracts are `Stratagems`, `Gems`, `GemsGenerator`, `TestTokens`, `Time`, so these do not type-check against a stratagems deployment.
- **`$lib/deployments` (generated)**: imported directly by `deployments-store.ts` and `embedded/deployments.ts`, and through them by 11 framework files directly and 71 transitively. After the merge, `ensure-deployments.mjs` would find stratagems' COMMITTED records (9 networks: `alpha1`, `alpha1_old`, `alpha1test`, `base`, `blast_testnet`, `composablelabs`, `fast`, `redstone_holesky`, `sepolia`) and export the first one `readdir` returns, so the generated file names stratagems' contracts and no `Game`; the throwaway deploy would never run. That meets the `Game`-by-name tie above.

What this says for step 4 (for that step to decide, not decided here): the reference game is not a leaf. It is wired into the framework through the app context (`context/game.ts`, `context/types.ts`), and reveal-or-die, which omits `placement/` too, compiles only because it REWRITES that context (`git diff stem/main main` in reveal-or-die: `context/game.ts` +988 lines changed, `context/types.ts`, `index.ts`, `offline.ts`, `kit/environment.ts`, `game/identity.ts`). stratagems does not adopt the app context until step 6, so omitting `placement/` alone leaves 65 framework files that cannot compile, and omitting those too leaves the merge carrying mostly `core/` and `game/` plus the unit tests that do not reach them. That is the seam finding the template's plan asks this member to produce: the app context is where a game plugs in, and today it is the reference game's own file.

Surprises: the pnpm 11 lockfile refusal; `check` needing `indexer:build` first; the template's `deployments.ts` not generated on the first install; and the size of the context tie (the plan's step 4 expected "a framework file that fails to compile only because of the omitted reference game" to be the exception, and it is 65 of 240).

### 2026-10-01, after step 0: how much of the app context is the game, and a prototype of the slot (step U2)

Not a step: the measurement and prototype behind step U2, asked for by the user after step 0's finding 4. The template prototype was a local branch at first; it was pushed to origin later that day (`proto/game-slot`, 4e1ee404), at the user's request, for later reference.

**Template `main` moved overnight**: b4d101ba (2026-09-30 19:56, after step 0's 2694b172), 10 commits of app-shell chrome (`ui/chrome`, `AppShell`, nav progress), none under `context/`, `placement/`, `ui/delegation` or `game/acquire`. At b4d101ba: `check` 0, unit 1697 + **78** (client 14 files; step 0 measured 76 in 13).

**`context/game.ts`, template (`with/all`) against reveal-or-die (`main`), comments stripped**: 439 against 534 code lines (930 against 1238 in all, so of `git diff`'s 992 changed lines about 620 are comments). 304 of the template's code lines survive unchanged; reveal-or-die removes 135 and adds 230. By section: imports 66 of 101 unchanged, exported types and helpers 60 of 79, the composition body 123 of 183, `start()` 32 of 49, the returned object 23 of 27. Read hunk by hunk, the additions are mostly the same call with the game's constructor or type (`createPlacementCommitReveal` to `createWorldCommitReveal`, `BoardState` to `WorldState`, `reserve` to `deposited`), about 90 lines are reveal-or-die's game only (avatar, position, enumeration recovery, controls, reveal outcome, what a click means), and about 40 are framework code grown locally (`onEachNewCycle`, wiring for `settleBoardWhenCycleStarts`/`refreshDuringReveal` which the template ships in `game/core/refresh.ts` and does not wire, a `currentCycleNumber` store). These were counted by reading, not by a script.

**The app context type**: `Context` has 44 members, 4 of them the game's (`onchainState`, `viewState`, `game`, `render`). Framework code reads them in two places only: `game/core/diagnostics.ts` (its own structural `DiagnosableApp`, which needs `game.submission` and `game.cycleInfo`) and `context/core.ts` (`onchainState`, for the refresh connector and RPC health).

**`contracts.Game` in framework code**: 8 address reads (`context/{config,core}.ts`, `game/acquire/acquire.ts` 3, the composition 2), one ABI (`acquire.ts` into `submitRegistration`), one `linkedData` (`onchain/state.ts`, cast to `{commitPhaseDuration: unknown, ...}`). The ABI was already erased: `submitRegistration` took `abi: readonly unknown[]` and `args: readonly unknown[]`, and its three callers cast their client `as unknown as RegistrationWriter`. The delegation surface is typed separately and exactly (`DELEGATION_ABI` from `@etherplay/delegation` 0.1.1, through `@etherplay/connect`: `registerDelegate(delegate, payee)` and `registerDelegateViaSignature(owner, delegate, deadline, signature)`, both payable).

**The prototype**, template-commit-reveal branch `proto/game-slot` from b4d101ba, worktree `~/dev/worktrees/template-commit-reveal/proto/game-slot`, 4 commits, 20 files, +189/-144:

- d3df3490, the registration typed against `DELEGATION_ABI` (the erasure fixed): `check` 0. Teeth, each tried and reverted: a `number` deadline, a dropped argument to `registerDelegate`, and `Game.abi` passed as the registry ABI each give 1 `check` error; on `main` all three compile. The three client casts were then REMOVED and `check` stayed 0, and that is real checking, not `any`: changing the writer's `value` to a `string` gives 3 errors, one at each caller.
- d1416564, the `$game` alias (the `$ui` precedent): `context/game.ts` to `placement/context.ts`; `placement/game.ts` declares the game; `Context = CoreContext & GameMembers`; delegation registry and operation scope are functions of `TypedDeployments`; `acquire.ts` reads `deps.delegation.registry`; the poller takes `cycleDuration`.
- 5accc66b, `AppContext` states what core needs (`onchainState: {update, status}`) and `core.ts` imports no game type. The first try, spreading `Omit<App, 'onchainState' | 'start'>` and adding `onchainState` back, does not type-check as `Omit<App, 'start'>` (a TypeScript limit with generic rests); spreading the app's members whole does, with the same runtime object.
- 4e1ee404, `debug/diagnostics.ts` (the game's, it reads `context.game`) moves to `placement/` and `AcrossPages.svelte` imports it through `$game`.

After every commit: `check` 0, unit 1697 + 78, unchanged.

**The stub test**, in a second throwaway worktree (`proto/stub-game`, detached, not committed): the reference game deleted (`placement/`, `offline*.ts`, `ui/offline-world`, `routes/{play,offline}`, `routes/+page.svelte`, their tests), the deployment's `Game` renamed `Stub` so no contract is called `Game`, `$game` pointed at a 40-line stub (an `onchainState` with `update` and `status`, a no-op `startDiagnostics`, contract functions naming `Stub`). Before the prototype's last two commits: 22 errors, two of them in `web/src` (`core.ts`: the stub's store was not a `HealthInput`, which is the framework stating a real requirement; and `debug/diagnostics.ts`). After: **0 errors in `web/src`**; 13 in 3 test files that test the reference game's fixtures (`embedded/{world,deployments}.test.ts`, which deploy and name `Game`; `canvas2d.svelte.test.ts`, which imports `placement/`, and reveal-or-die omits it already). With those three removed: `check` 0, unit **1538 pass, 3 fail**, all three guards for a game on the framework: `identity-boundary` refuses to pass when no module uses the submission machinery ("this suite is not checking anything"), and `render-host-boundary` (2) reads `routes/play/+page.svelte` and `placement/render` by path.

**Where each part lives**: `ui/delegation/register-delegate.ts` and `ui/credits/top-up-flow.ts` are byte-identical to jolly-roger's (`stem/integration`), `registration.ts` differs by 2 lines, and jolly-roger's `core.ts` already has the `Context['onchainState']` pattern for its greetings app. So parts 1 and 2 of step U2 are jolly-roger's, part 3 is the template's.

**Found on the way, the template's**: `pnpm install` on a fresh worktree failed in `contracts prepare` with `FileNotFoundError ... cache/build-info/solc-0_8_28-....output.json`: the root `prepare` (`ensure-deployments.mjs`, whose fallback deploy compiles) and `contracts prepare` (which compiles) run concurrently into the same Hardhat cache. That is the likely cause of step 0's missing `deployments.ts` on the first install too. Not diagnosed further; worth a note in the template's own work tree.

### 2026-10-01, step 1: pnpm 10

Branch `pnpm-10` from the integration branch at a4fb8f0, worktree `~/dev/worktrees/stratagems/pnpm-10`. Two commits: 4bc97be (the move) and d4864bf (a hoisting fix the move needed). Node v24.19.0.

**What changed.**

- `packageManager: "pnpm@10.28.1"` in the root `package.json` (the template's). The system pnpm here is 11.25.0; it honours the field and runs 10.28.1, so step 0's caveat a (pnpm 11 refusing the lockfile, and its one-day `minimumReleaseAge`) no longer applies on a machine whose pnpm honours the field.
- The root `pnpm` field (`supportedArchitectures`, `overrides` (21 entries), `auditConfig`) moved verbatim to `pnpm-workspace.yaml`. pnpm 10.28.1 itself still read the field silently; the "no longer read" warning came from the pnpm 11 front-end, on every command, and is gone.
- Install scripts: pnpm 10 skipped 11 (`@parcel/watcher`, `@sentry/cli`, `@sveltejs/kit`, four `esbuild`s, `sharp`, `svelte-preprocess`, `vue-demi`, `workerd`). `onlyBuiltDependencies: [esbuild]`, as in the template. The other seven are in `ignoredBuiltDependencies` (so pnpm stops warning about them), each checked to work without its script, with the reason in a comment: `sharp` rendered a PNG, `workerd` 2024-06-05 and `sentry-cli` 2.32.1 answer `--version`, all from their `optionalDependencies` platform binaries; the four esbuild binaries answer a transform; `vue-demi` already defaults to Vue 3; kit's postinstall is a `svelte-kit sync`, which web's `check`, `dev` and `build` run anyway; `svelte-preprocess` only prints a reminder. The plan's other candidates do not exist here: contracts' hardhat and solc have no install script (solc is downloaded at compile time), and there is no `better-sqlite3`; libsql ships prebuilt optional binaries.
- CI (`ipfs.yml`, `github-pages.yml`): `pnpm/action-setup@v2` with `version: 9` became `@v4` with no `version:`, so it reads `packageManager`. Not run in CI (both workflows only run on push to `public`/pages); judged by reading.
- **Found: pnpm 10 dropped `*prettier*` from its default `public-hoist-pattern`**, so the root `prettier --check .` failed on `docs/.prettierrc` (`Cannot find package 'prettier-plugin-svelte'`): `docs/` is not a workspace, and only `web` declares the plugin. Fixed by declaring it at the root (`^3.2.4`, the same resolved 3.2.4 as web). Step 4 merges the root `package.json`, so keep it there.
- The lockfile: the first install with pnpm 10 was frozen and wrote nothing (pnpm 10 keeps lockfile v9, and the moved overrides match). The `pnpm add` above was pnpm 10's first write: the set of resolved packages is identical (1420 keys in `packages:` before and after), only peer contexts were re-derived: `fuzd-nodejs`'s optional `hono` peer now points at the 4.13.11 already in the tree instead of 4.6.9, and a `zod` peer context drops from viem, abitype, ox and the fuzd packages. `fuzd-nodejs --help` runs (it prints "Failed to find Response internal state key", which is `@hono/node-server` 1.13.5 probing Node 24's own `Response`, independent of the hono version).

**Baselines, from a clean install** (all `node_modules`, `common/dist`, `indexer/dist`, `web/build`, `web/.svelte-kit` removed first), against step 0:

| check                                   | step 0 (pnpm 9.15.9)                      | step 1 (pnpm 10.28.1)                                                        |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`        | exit 0, 1241 packages, no warning         | exit 0, 1241 packages, no warning, no ignored-build notice (4 s, warm store) |
| `pnpm indexer:build alpha1`             | exit 0                                    | exit 0 (6 s)                                                                 |
| `pnpm --filter ./web check`             | 0 errors, 0 warnings                      | 0 errors, 0 warnings                                                         |
| `pnpm --filter ./contracts test`        | 6 files pass, 1 skipped; 69 pass, 67 skip | the same, 62.5 s                                                             |
| `pnpm format:check`                     | clean                                     | clean (after d4864bf; failed before it, see above)                           |
| `MODE=alpha1 pnpm --filter ./web build` | exit 0, no `(!)`, 14 MB, 102 files        | exit 0, no `(!)`, 14 MB, 102 files                                           |

Surprises: the prettier hoisting change; and `pnpm --filter ./contracts test` (`pnpm compile && vitest`) does not exit when run from this agent's shell: vitest 1.x decided it was interactive and stayed in watch mode after passing (timed out at 900 s). With `CI=1` it exits 0 in 64 s. Not a pnpm effect (the same `vitest` binary and script), so step 0 presumably ran it non-interactively; step 4's criteria now say `CI=1`.

### 2026-10-01, step 2: stratagems' app moves to `web/src/lib/stratagems/`

Branch `lib-stratagems` from the integration branch at 7412c7e, worktree `~/dev/worktrees/stratagems/lib-stratagems`. Two commits:

- 99bb0bf, **the pure move**: `web/src/lib/{account,actions,blockchain,config.ts,render,state,ui}` into `web/src/lib/stratagems/`. 118 files, every one a rename at similarity 100%, 0 insertions, 0 deletions. This commit alone does not build (its imports still point at the old paths); it is split from the next one so git records every file as an exact rename, which is what `git log --follow` and step 4's merge read.
- bdc87c5, **the imports the move broke, and nothing else**: every `$lib/` becomes `$lib/stratagems/` (193 lines in 71 files, inside and outside `lib`), the one relative import that leaves `lib` gains a `../` (`actions/claim/ClaimTokenScreen.svelte` to `src/utils/ethereum/ImgBlockie.svelte`), two comments name the worker's new path (`vite.config.ts`, `scripts/processor-bundle.js`), and prettier wraps the one import line that grew past 120 columns (`ui/components/InfoBar.svelte`). 73 files, +202/-196.

Not changed, on purpose: the `svelte.config.js` aliases (`$data`, `$external`, `$utils`, `web-config` point outside `lib`); `web/src/utils` and `web/src/data`; and the indexer worker's `appRoot()` marker `'/src/lib/'`, which still matches the worker's dev URL `/src/lib/stratagems/state/...` because it slices at the marker's first occurrence. The worker's `new URL('./indexer.worker.ts', import.meta.url)` is relative to its own file, which moved with it.

**Measured** (fresh install, then `pnpm indexer:build alpha1`):

- `pnpm --filter ./web check`: svelte-check 0 errors, 0 warnings.
- `pnpm format:check`: clean.
- `MODE=alpha1 pnpm --filter ./web build`: exit 0, no `(!)`, 14 MB, 102 files (as at steps 0 and 1).
- `git show --stat -M 99bb0bf`: 118 files changed, 0 insertions, 0 deletions, 118 renames at 100%. `git log --follow web/src/lib/stratagems/state/State.ts` crosses the move to the file's earlier history.
- **The board under `vite dev`**: `MODE=alpha1 ldenv vite dev --port 5180` (5173 and 5174 belong to other projects), with the alpha1 publication copied from the main checkout's gitignored `web/static/indexed-states/alpha1`. In headless Chromium (Playwright 1.62.1), the welcome screen, then "Just Observe": the canvas draws the alpha1 board (factions and terrain, the "Indexing..." bar running). Three failed requests, none about the move: `snapshots.stratagems.world/alpha1/publication.json` 404 (the remote snapshot is not published; the embedded one is used), and `mainnet.base.org` 413 on a POST, Base's public node refusing a large request while the worker indexes forward from the publication's cut (`.env.alpha1` points at the public node; the full verification in step 3 goes through the caching proxy). The dev server was stopped by its process group.

Surprises: none of substance. The move commit is not buildable by itself, by design; bisecting across it needs to skip it.

# `with/pixi-js`

The pixi host, this game's pixi board, and the sprite pipeline. Everything that
needs a rendering library installed, and nothing else.

`main` carries the render SEAM and the host that needs no install (the immediate
renderer on a canvas-2d surface). This branch carries the LIBRARY and its build.
The choice of renderer was already a seam and stays one; what earns a branch is
the 79M install, which is the largest single one in the tree and the cost a
non-adopter would otherwise pay. See D11 in
`work:work/specs/proposed/games-on-this-foundation.md`.

## The shared-file edit list

This is rule **N1**'s budget, and the number this branch is judged on. Every
file here also exists on `main`, so every one of them is a place a future
cascade can conflict. Growing the list needs a reason.

| file | what the branch changes | kind |
| --- | --- | --- |
| `web/src/lib/placement/render/index.ts` | selects the pixi host instead of the canvas-2d one | **the point of the branch** |
| `web/vite.plugins.ts` | adds `assetpackPlugin()` beside the inherited `tailwindcss()` | **a file that exists to differ** |
| `web/package.json` | `pixi.js`, `@assetpack/core` | dependency |
| `pnpm-lock.yaml` | generated | dependency |

**None of those is a file this branch has to fight for.** The lockfile and
`package.json` are what any branch that adds a dependency must touch; both are
generated or append-only and merge without a human. The other two are files
whose whole purpose is to differ.

**`web/vite.config.ts` USED TO BE ON THIS LIST AND WAS THE ONE REAL HAZARD.**
It is byte-identical to jolly-roger's, developed two repos up, and restructured
wholesale in a descendant, so the two lines this branch kept there were a
conflict site on every cascade forever. It came off the list by fixing the cause
where it lived: `template-svelte`, the root of the tree, now spreads
`extraPlugins()` from `web/vite.plugins.ts` into its plugin list, so a
descendant, a variant or a branch adds a plugin by editing a small file instead
of a large shared one. Every level of the tree had been paying that tax to say
the same one thing.

`.gitignore` came off earlier, when the pipeline's entries moved to `main` -
they belong there anyway, because a checkout that has been on this branch leaves
generated files behind and `format:check` went red on a generated manifest.

**The COUNT is still four, and saying otherwise would be the wrong claim.** The
list went five to four when `.gitignore`'s entries moved to `main`; the vite
change did not shorten it, it swapped one entry for a better one. What improved
is the KIND of file the branch holds a difference in:

| before | after |
| --- | --- |
| `web/vite.config.ts` - 108 lines, byte-identical to jolly-roger's, developed two repos up, restructured wholesale in a descendant | `web/vite.plugins.ts` - a few lines, exists in order to differ, nothing upstream will ever change it for another reason |

That is the whole difference between a conflict site and a switch, and it is
worth more than a smaller number would have been. Both removals were fixes
upstream rather than workarounds here.

- **`placement/render/index.ts` is the intended difference** and is close to
  free: it is this repo's own file, nothing upstream develops it, and it is the
  one file the template already documented as "the one file to edit to change
  the renderer". This is the `mode.ts`/`TARGET_STEP` shape from N2 applied to a
  different axis.
- **`web/vite.plugins.ts` is where the pipeline is wired**, and it is cheap for
  the same reason `mode.ts` is cheap upstream: it is a few lines that exist to
  be different, not a hunk inside something else. The entry is one
  unconditional line, because `assetpackPlugin()` returns `false` when there is
  no art and under vitest and vite filters falsy plugins - so the decision
  stays with the paths it depends on. Both copies this was reconciled from put
  that `existsSync` check in `vite.config.ts` and paid four lines for it.

### What is NOT on the list, and why that took work

- **`web/src/routes/play/+page.svelte`.** It mounts whichever host the selector
  names and passes `cellSize` and `gridCells`, which only a scene-graph host
  uses. The canvas-2d host on `main` accepts and ignores them, which is what
  keeps this route byte-identical on both nodes. `web/test/render-host-boundary.test.ts`
  fails if the page passes a prop the selected host does not declare, and it
  binds to whichever host is selected, so it protects the invariant from BOTH
  sides.
- **`web/src/lib/game/render/README.md`.** It describes both nodes, deliberately,
  and lives on `main`.
- **The loading gate.** reveal-or-die's splash covers the whole application,
  which would mean editing a layout or a route. This one is rendered by
  `PixiCanvas.svelte`, a file only this branch has, so it costs nothing. It also
  covers the region that is actually unpainted.
- **`stateful.ts` and `reconcile.ts`.** They import no rendering library and stay
  on `main`, where a three.js or twgl host finds them. Shared machinery
  exercised by a feature branch rather than by the base is the normal shape of a
  fan.

## What is on the branch

```
web/vite.assetpack.ts                            the pipeline
web/src/lib/game/render/pixi/PixiCanvas.svelte   the host
web/src/lib/game/render/pixi/world.ts            camera -> pixi container
web/src/lib/game/render/pixi/surface.ts          pixel art (default) or smooth art
web/src/lib/game/render/pixi/assets.ts           bundle loading + progress
web/src/lib/game/render/pixi/LoadingGate.svelte  progress -> something on screen
web/src/lib/placement/render/board-renderer.ts   this game's board, diffed
web/src/lib/placement/render/CellObject.ts       one cell, drawn with the sprite
web/test/vite-assetpack.test.ts                  the workaround that earned the node
assets/sprites/cell.png                          one sprite
```

**The sprite has a consumer on purpose.** A pipeline whose output nothing draws
would type-check, build, emit a manifest and prove nothing, which is precisely
the unexercised code D11 exists to remove. `CellObject` draws the tile for a
claimed cell and falls back to vector graphics when there is no sheet, so both
paths are reachable in an ordinary checkout and a clone without `../assets`
still builds and plays.

**Pixel art is the default, smooth art is a prop.** The host renders at one pixel per CSS pixel, without antialiasing and with positions rounded, because the reference game's sprite is pixel art. A game drawing smooth art (gradients, fine rings) passes `smooth` and gets the device ratio and antialiasing (`surface.ts`), and sets `linear` filtering on the textures it makes, since `assets.ts` makes `nearest` the default for every texture. The canvas-2d host on `main` accepts `smooth` and ignores it, so the props stay identical.

## The pipeline is a MOVE, and its second half is not done yet

`vite.assetpack.ts` is the reconciliation of two independently authored copies -
`reveal-or-die/web/vite.assetpack.ts` (139 lines) and
`conquest-v1/web/vite-assetpack.ts` (117) - which is what earned this node: two
people wrote it twice and reached the same two workarounds.

**reveal-or-die's copy is GONE; conquest's remains, and that is tracked rather
than forgotten.** Deleting a descendant's copy is only safe once it INHERITS
this branch. reveal-or-die now does: its `stemBranch` was re-pointed at
`with/all` on 2026-09-11 and its own 139-line `web/vite.assetpack.ts` was
deleted in the same change, replaced by this branch's 225-line reconciliation
(verified 2026-09-23: same blob in both repos, so it is inheriting rather than
holding a copy that merely resembles it). What it gained in the swap is
conquest's `fixManifest` and the self-disable.

conquest still stems from jolly-roger directly and keeps its own
`web/vite-assetpack.ts`, so that half of the move is still pending. The exact
deletion list and what the diff actually decided - including the one item the
list got wrong, `ui/loading/`, which is a game's BRAND rather than a second
copy of the framework's gate and was correctly kept - are in
`work:work/notes/observations/the-asset-pipeline-move-cannot-complete-until-the-repoint.md`.

## Cascade ritual

```sh
git merge main
pnpm --filter ./web check
pnpm --filter ./web run test:unit
BASE=main FEATURES=with/pixi-js EXT="ts svelte" \
  WATCH="web/src web/test" \
  ALLOWED="web/src/lib/placement/render/index.ts" \
  bash <(git show tooling:check-shared-divergence.sh)
```

`tooling` is a LOCAL orphan branch here, adopted verbatim from jolly-roger's
(N6), so the command needs no sibling checkout on disk. It shares history with
nothing and is not in `fanout.config.json`, so it can never arrive through a
merge or be cascaded into.

**It is deliberately NOT pushed to this repo's origin**, which is the whole
point rather than an oversight. jolly-roger's copy is the only canonical one; a
pushed copy here would be a second place it can drift, which is exactly the
failure the script exists to catch, one level up. It is a cache, and it is
rebuilt in one command:

```sh
git fetch stem tooling && git branch -f tooling stem/tooling
```

Run that on a fresh clone, and again whenever jolly-roger's moves. **Do not edit
it here.** If the script needs changing, change it on jolly-roger's `tooling`
branch and re-fetch, or the next person to re-fetch silently loses the fix.

The `ALLOWED` entry is the renderer selector, and it is the exact analogue of
`mode.ts` upstream: the one file that is SUPPOSED to differ, because it is the
switch this branch exists to flip. Anything else drifting under those paths is
the failure the script is for - a cascade whose conflicts were all resolved
correctly and which still left a shared file holding two versions of the same
logic.

`EXT="ts svelte"` matters here and is why the command above is not the upstream
default. The script watched `.ts` only, which is right for jolly-roger's
connection layer (apps restyle their own wallet flows) and wrong for a renderer
swap, where the shared file this branch most depends on staying identical is
`routes/play/+page.svelte`. That is now a variable upstream, with `ts` still the
default; the run covers 530 shared files rather than 367.

**One thing it still will not tell you: a DELETION.** It compares files two
branches SHARE, so a file removed on one side and still imported on the other
leaves nothing to diff. That is the shape that makes `main` currently
unmergeable into reveal-or-die - the pixi host was deleted upstream and is still
imported there, and the merge reports success on that hunk while conflicting on
three unrelated files. What catches that is the cascade's `verify` step.

# Rendering

The framework does not care how a game draws itself. It owns the camera, the gestures and the view state; a game owns the pixels. This note says what the seam is, which of the three styles to fill it with, and what you have to write in each case.

The seam is `GameRenderer<TSurface>` in `$lib/game/core/seams`:

```ts
type GameRenderer<TSurface> = {
	onAppStarted(surface: TSurface): void;
	onAppStopped(): void;
	tick(frame: Frame): void;
};
```

`TSurface` is whatever the mounted canvas hands over: a pixi `Container`, a `CanvasRenderingContext2D`, a `WebGL2RenderingContext`, a three.js `Scene`. The framework never inspects it.

## Picking a style

|                                 | you write                   | the framework gives you                                         | good for                                                                                           |
| ------------------------------- | --------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Reactive** (Svelte)           | a component                 | nothing extra: `viewState` is a store                           | HUDs, card games, board games with few entities, anything that is really a UI                      |
| **Immediate** (twgl, canvas 2d) | a `draw` function           | the current view snapshot, per frame, with the camera transform | GPU rendering, thousands of entities, tile maps, anything where you would rather rebuild than diff |
| **Stateful** (pixi, three.js)   | `add` / `update` / `remove` | the diff, cycle changes, teardown                               | sprite scenes, retained scene graphs, anything with per-object animation                           |

If you are unsure, the answer is reactive until it is slow, then immediate. Stateful is the right answer when the library you want is retained-mode, which pixi and three.js are.

Only the last two are `GameRenderer`s, and only they are swapped by editing one file in your own game's `render/` directory (see "Switching renderer"). Reactive is a different shape: no surface, no frame loop, nothing to hand to `onAppStarted`. It is listed here as a peer because it is a real choice, not because it is the same kind of change.

### Which host is on which branch

**`main` carries no rendering library at all.** The host it ships is the immediate one on a canvas-2d surface, which needs nothing installed, and that is what the template's own game draws with.

The pixi host lives on the **`with/pixi-js`** branch, together with this game's pixi board (`board-renderer.ts`, `CellObject.ts`) and the sprite pipeline. The reason is install cost rather than bundle size: `pixi.js` is a 79M install, the canvas is dynamically imported already, and a branch is what the tree charges for a dependency a non-adopter would otherwise pay for. See D11 in `work:work/specs/proposed/games-on-this-foundation.md`.

What is NOT on that branch is the diffing machinery. `stateful.ts` and `reconcile.ts` import no rendering library, they are what ANY scene-graph host builds on, and they stay here so that a three.js or twgl host finds them without adopting pixi. They are therefore exercised one node down rather than by the base, which is the normal shape of a fan and not a smell.

This file describes both nodes deliberately, so that the branch does not have to edit it. Keep it that way: a doc that has to be edited on the branch is a merge conflict for every future change to it.

### Reactive

The view state is a Svelte store, so a component subscribes to it like any other:

```svelte
{#each [...$viewState.cells.values()] as cell (cell.cellID)}
	<Cell {cell} />
{/each}
```

Delete your game's own `render/` directory and drop `gameRenderer` from the context; there is no renderer to point anywhere.

**The camera is not free, and getting this wrong is silent.** The poller is camera-scoped and refuses to fetch while the camera reports no size (`onchain/state.ts`). A component that only subscribes to `viewState` never calls `cameraControl.resize`, so the board stays empty forever with no failed request and no warning: it looks like a game with nothing in it yet. Pick one deliberately:

- **Keep the camera.** Have the component report its own size and drive pan/zoom into `cameraControl`. `connectSurfaceInput` takes any `HTMLElement`, not just a canvas, so this is a few lines.
- **Drop camera scoping.** Give `createPollingOnchainState` a fixed scope instead. Right whenever the world fits on one screen, which is most games that want to render in Svelte in the first place.

The template ships no reactive example. The two canvas paths are the ones with working code and tests behind them.

### Immediate

`createImmediateRenderer` holds the latest view snapshot and hands it to `draw` with the frame. That is the whole of what the framework owes an immediate renderer: a store is a push interface and a frame loop is a pull one, so without it every game writes the same `let latest` and the same subscription, and one of them forgets to unsubscribe.

```ts
createImmediateRenderer<CanvasRenderingContext2D, BoardView>({
	viewState,
	draw({surface, view, frame}) {
		if (view.step === 'Unloaded') return;
		for (const cell of view.cells.values()) {
			// ... draw it, in game units, under frame.transform
		}
	},
});
```

`draw` is called for the `Unloaded` state too, rather than being skipped until the state loads. An immediate renderer normally clears its surface every frame anyway, and skipping the call would leave the last loaded frame burnt into the canvas.

For a working one, read whichever module your game's `render/index.ts` names as its renderer factory; the game that ships with this template draws its board that way.

### Stateful

`createStatefulRenderer` diffs the view state and calls three handlers about your own entities. It subscribes rather than diffing per frame, because a scene graph only needs touching when the state changes.

```ts
createStatefulRenderer<Container, BoardView, bigint, CellView, CellObject>({
	viewState,
	entities: (view) => view.cells,
	changed: (a, b) => a.totalStake !== b.totalStake || a.planned !== b.planned,
	add: ({entity, surface}) => surface.addChild(new CellObject(entity)),
	update: ({object, entity}) => object.update(entity),
	remove: ({object, surface}) => surface.removeChild(object),
});
```

Four things it does that a hand-written loop usually does not, all of which are pinned by tests in `web/test/lib/game/render`:

- **`changed` is a typed comparison, not a key string.** Stateful renderers grow a dirty check like `` `${stake}:${claimants}:${planned}` ``. When a field is left out of one, the object simply never updates on screen and nothing fails.
- **An `Unloaded` view empties the scene.** State can go backwards (an account switch, a chain reset), and a loop that returns early on `Unloaded` leaves a board that belongs to nobody on screen forever.
- **Cycle changes are announced**, before that cycle's entities are applied. A commit-reveal game draws local intent that is scoped to exactly one cycle; without a signal, a renderer can only infer the boundary from entities changing, which is the inference that fails when nothing changed.
- **Teardown drops objects without running `remove`.** The surface has already taken them. Use `onStopped` for anything the surface does not own.
- **`tick` can enumerate the live objects.** It is handed `objects` (and `entries`, keyed) alongside the frame, which is what makes the per-object animation this style is recommended for actually writable. Without it a renderer has to keep its own parallel collection, filled in `add` and emptied in `remove`: a second source of truth that is wrong exactly when a handler throws or a key is re-added, and silent when it is wrong.

```ts
tick: ({frame, objects}) => {
	for (const object of objects) object.advance(frame.deltaMs);
},
```

## The camera is the framework's, and it is authoritative

`camera.ts` holds the view transform. Gestures are fed into it; the surface reads the transform back and applies it when it draws. It does not delegate to a rendering library, which means it works with no surface mounted (`follow()` on a cold load moves the camera instead of being silently dropped) and there is one place a game can animate, restore or constrain the view from.

Three layers, none of which know about any rendering library:

- `view-transform.ts` is the arithmetic: world/screen conversion, zoom limits, fitting, zoom-about-a-point, culling. Pure functions. (`ViewTransform` and `ScreenSize` themselves are declared in `game/core/seams`, because `Frame` carries them and that keeps the dependency running render → core.)
- `gestures.ts` recognises drag-to-pan, pinch, wheel and tap, and emits INTENTS. The recogniser takes plain numbers so it can be tested in node; `attachGestures` is the thin DOM half.
- `camera.ts` applies intents to the transform and publishes the `Camera` store the state layer reads to decide what to load.
- `keys.ts` and `gamepad.ts` are the same split for the keyboard and the gamepad. See below.
- `grid.ts` is where the grid lines are, in game units, shared by both hosts so they cannot drift apart.
- `frame-loop.ts` is the elapsed/delta bookkeeping (in milliseconds, and the `Frame` field names say so) and `Frame` assembly, shared for the same reason.

## Keyboard and gamepad, as intent recognisers

Same shape as `gestures.ts`, twice more: a pure recogniser that turns raw input into a `ControlIntent`, and a small DOM half that feeds it. Nothing here knows what a piece, a round or a cycle is.

| file         | pure half                                                     | DOM half                       |
| ------------ | ------------------------------------------------------------- | ------------------------------ |
| `intents.ts` | the vocabulary: `direction`, `confirm`, `secondary`, `cancel`, and `action` for any further one the game names | none |
| `keys.ts`    | `recognizeKey(sample)`                                        | `attachKeys(target, onIntent)` |
| `gamepad.ts` | `createGamepadRecognizer().poll(pads)`                        | `attachGamepad(onIntent)`      |

**The mapping from an intent to a game action stays in the game.** Directional / confirm / cancel input is generic to any board game on this template; "step north" and "commit the round" are not - both are what a PARTICULAR GAME calls a control, which is why `round` here is the word `CONTEXT.md` reserves for games rather than one a vocabulary sweep missed (`intents.ts` quotes the same pair for the same reason). That is the whole line, and it is what lets one mapping serve a keyboard, a gamepad and an on-screen d-pad without three copies of the game's rules.

**A game with more actions than that names them.** `{type: 'action', name}` carries any further action, and the game binds keys and buttons to it (`attachKeys(target, onIntent, {actions: {b: 'delayedBomb'}})`, `attachGamepad(onIntent, {actions: {3: 'delayedBomb'}})`). The adapters never read the name, so no game's word enters this directory; they only keep the guarantee every other intent has, that one action is reachable from every device. Before this, bomber-world had to listen for a key outside the seam, and its delayed bomb had no gamepad button at all.

The recognisers are pure for the reason `gestures.ts` gives: the interesting cases are the ones a human cannot reliably perform. A held key repeating thirty times a second, a modifier chord, a controller that reports six buttons instead of seventeen, a stick rolled from left to up without passing the centre. Each is one function call in the node test project and a fight in a browser.

Two guards in `attachKeys` are worth not losing, because both were paid for:

- **`preventDefault` is called only for keys that produced an intent.** Arrows and space scroll the page, and a board that jumps a screen down on every step is unplayable; but swallowing Tab would trap keyboard navigation and swallowing F5 would break reloading.
- **Where a keystroke is aimed is asked in two kinds, not one.** A text field consumes every key including the arrows, so the game hears none of them. A focused button consumes only Enter and Space, so it loses only those. Collapsing the two is a bug in whichever direction you collapse it, and the second bites immediately: pressing an on-screen d-pad with a mouse leaves that button focused, so a blanket rule stops the keyboard working with nothing on screen to explain why.

`attachGamepad` polls only while a pad is connected and starts on `gamepadconnected`, so a player with no gamepad pays nothing. Neither one decides a lifetime: bind them where input should be live, which is usually the route rather than the canvas, so input survives a canvas unmount without outliving the board.

**A click leaves this layer as a world POINT, not a cell.** Snapping is a game rule: rounding to the nearest integer would make every game on the template a square grid with cells centred on integers. The template's game does that rounding in its own click handler in `placement/context.ts`; a hex board or a continuous world does something else.

Two units, and confusing them is the only way to be wrong here: **world means GAME units (cells), and `scale` is CSS pixels per game unit.** Device pixel ratio belongs to the surface, which scales its own backing store. `cellSize` is only meaningful to a scene graph authored in PIXELS, so an immediate renderer never needs it: it draws in game units under the camera transform and lets the context do the conversion. On `with/pixi-js` it appears in exactly one framework file (`pixi/world.ts`); here it appears in none, and is carried through the host's props only so that swapping costs one file.

### Why not pixi-viewport

It did three jobs: recognise gestures, hold the transform, and apply it to a pixi container. Only the third is pixi's, so two thirds of it had to be written again for any non-pixi surface, and every non-pixi game on this template would have started by copying two hundred lines out of another repo. What we used of it is now about the same amount of code in `gestures.ts` plus `view-transform.ts`, shared by every surface and testable without a GPU.

What was dropped, because no game on this template ever called it: deceleration and inertia, bounce, clamping to world bounds (these worlds are infinite), snap, follow-a-target animation, mouse-edge scrolling. What was gained: pointer capture in place of `allowPreserveDragOutside`, one code path for mouse, touch and pen, and click coordinates that are correct wherever the canvas sits on the page (`toWorld(event.global)` was only correct while the canvas was flush against the viewport origin, which it is not).

## Switching renderer

Your game's own `render/index.ts` is the only file to edit. It names the surface type, the renderer factory and the canvas component.

That it is only one file is a property with a price, and it is worth knowing what pays for it. `PixiCanvas.svelte` and `Canvas2DCanvas.svelte` take **identical props**, so `routes/play/+page.svelte` does not change when you switch - including `cellSize` and `gridCells`, which only a scene-graph host has any use for and which the canvas-2d host accepts and ignores. Those two look like dead props and are not: removing them would move the swap's cost into a route file that both branches keep developing. `web/test/render-host-boundary.test.ts` fails if the page passes a prop the selected host does not declare.

So: if you add a prop to one host, add it to the other.

Writing a third host (twgl, three.js) is `Canvas2DCanvas.svelte` with `getContext('2d')` replaced and the surface type changed. Everything else in it is framework wiring: `connectSurfaceInput` for gestures, the resize observer and click-to-cell, and `createFrameLoop` for the elapsed/delta arithmetic. Only the schedule is the host's, because a library with its own ticker (pixi) has to keep it in order to render after the scene is updated.

## What a host owes the framework

1. Report its size in CSS pixels (`connectSurfaceInput` does this with a `ResizeObserver`).
2. Feed gestures to the camera, and clicks to the game (`connectSurfaceInput` again).
3. Call `renderer.tick(frame)` once per frame, building the frame with `createFrameLoop`.
4. Apply the transform when it draws, or leave that to the renderer if the style is immediate.

Only step 4 is renderer-specific.

`frame.devicePixelRatio` is what the host ACTUALLY configured its buffer to, which is not always `window.devicePixelRatio`. The canvas-2d host sizes its backing store at the device ratio and reports that. The pixi host on `with/pixi-js` pins pixi's `resolution` to 1, because the art is pixelated and upscaling it defeats the point, so it reports 1 and a renderer sizing a hairline off it is right to draw one CSS pixel. Report what you configured, or renderers that trust the number will draw at the wrong size.

The canvas-2d host is covered two ways, and the split is deliberate because one of them cannot see the other's subject. `test/lib/game/render/canvas2d.svelte.test.ts` mounts it on a real canvas and reads PIXELS back, which is the only way to catch a coordinate or alpha drift between `beginFrame`, `applyCamera` and the renderer. The other half is the game's own: this template's reference game drives its board renderer against a context that RECORDS calls, because culling changes no picture at all - canvas discards an out-of-range `fillRect` silently - so a pixel test cannot see the one piece of logic in that file that is not a drawing call.

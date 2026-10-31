/**
 * STRATAGEMS' BOARD (step 9 of work/plans/join-template-commit-reveal.md): a
 * board reminiscent of Go, drawn with pixi on the template's pixi host, in the
 * template's stateful style (P9-3). One `CellObject` per cell, kept in step with
 * the view by `$lib/game/render/stateful`; board-wide layers drawn here: the
 * wood, its lines and hoshi (P9-4; the host's own grid is off), the two washes,
 * and the bridges and notches.
 *
 * - The wood and the lines are drawn from the first frame, before the indexed
 *   board is loaded (P9-8), and follow the camera.
 * - The bridges are rebuilt when the view or the focused owner changes, never
 *   per frame; the washes are cached as one texture each, refreshed when a
 *   cell's wash changes (P9-10: nothing per frame but the pulse and the crack).
 * - No filter anywhere: pixi's Canvas renderer, the fallback when WebGL cannot
 *   start, skips them (P9-7).
 */
import {Container, Graphics, Rectangle, TilingSprite} from 'pixi.js';
import {get, type Readable} from 'svelte/store';
import type {Frame, GameRenderer} from '$lib/game/core/seams';
import {createStatefulRenderer} from '$lib/game/render/stateful';
import {visibleCells} from '$lib/game/render/view-transform';
import type {ViewStateStore} from '$lib/view';
import type {BoardView, CellView} from '../view';
import {CellObject, type BoardLayers, type CellLook} from './CellObject';
import {
	cellKeyAt,
	gemColourNumber,
	HOSHI_EVERY,
	isGhost,
	isLit,
	linksOf,
	pulse,
	sameZoom,
	zoomOf,
	type Zoom,
} from './look';
import type {FocusStore} from './focus';
import {LINE_INK, WOOD_TILE_CELLS, woodTexture} from './textures';

/** The two washes' strength (P9-5): the ivory under yours, the faction's. */
const IVORY_ALPHA = 0.75;
const FACTION_ALPHA = 0.4;
/** The largest side, in pixels, of a wash's cached texture. */
const WASH_TEXTURE_MAX = 2048;
/** A press that moves more than this is a pan, not a tap (CSS pixels). */
const TAP_SLOP = 5;

export function createBoardRenderer(params: {
	viewState: ViewStateStore<BoardView>;
	cellSize: number;
	maxLife: number;
	focus: FocusStore;
	/** The faction wash, a toggle (off by default). */
	factionWash: Readable<boolean>;
}): GameRenderer<Container> {
	const {cellSize, maxLife, focus} = params;

	let layers: (BoardLayers & {links: Graphics}) | undefined;
	let latest: BoardView | undefined;
	let zoom: Zoom = zoomOf(0);
	let focusOwner: string | undefined;
	let washDirty = false;
	/** The zoom class or the focus changed: every cell is drawn again. */
	let restyle = false;

	const look = (): CellLook => ({
		cellSize,
		maxLife,
		zoom,
		focusOwner,
		isLit: (cell) => focusOwner !== undefined && isLit(cell, focusOwner),
	});

	const cells = createStatefulRenderer<
		BoardLayers,
		BoardView,
		string,
		CellView,
		CellObject
	>({
		viewState: params.viewState,
		entities: (view) => {
			latest = view;
			return view.cells;
		},
		add: ({entity, surface}) => new CellObject(entity, look(), surface),
		update: ({entity, object}) => object.update(entity, look()),
		remove: ({object}) => object.destroy(),
		tick: ({frame, objects}) => {
			const shared = pulse(frame.timeMs);
			const style = restyle ? look() : undefined;
			restyle = false;
			for (const object of objects) {
				if (style) object.restyle(style);
				object.tick(frame.timeMs, shared);
			}
		},
	});

	// ------------------------------------------------------------ the bridges

	function drawLinks() {
		const links = layers?.links;
		if (!links) return;
		links.clear();
		if (!latest) return;
		const r = 0.38 * cellSize;
		for (const link of linksOf(latest.cells)) {
			const a = latest.cells.get(cellKeyAt({x: link.ax, y: link.ay}))!;
			const b = latest.cells.get(cellKeyAt({x: link.bx, y: link.by}))!;
			const lit =
				focusOwner === undefined ||
				(link.kind === 'bridge'
					? isLit(a, focusOwner) && isLit(b, focusOwner)
					: isLit(a, focusOwner) || isLit(b, focusOwner));
			const alpha = (lit ? 1 : 0.15) * (link.planned ? 0.45 : 1);
			const horizontal = link.ay === link.by;
			const [x1, y1, x2, y2] = horizontal
				? [
						link.ax * cellSize + r * 0.8,
						link.ay * cellSize,
						link.bx * cellSize - r * 0.8,
						link.by * cellSize,
					]
				: [
						link.ax * cellSize,
						link.ay * cellSize + r * 0.8,
						link.bx * cellSize,
						link.by * cellSize - r * 0.8,
					];
			if (link.kind === 'bridge') {
				const w = cellSize * 0.26;
				const rect = () =>
					horizontal
						? links.roundRect(x1, y1 - w / 2, x2 - x1, w, w / 3)
						: links.roundRect(x1 - w / 2, y1, w, y2 - y1, w / 3);
				rect().fill({color: gemColourNumber(link.color), alpha});
				rect().stroke({
					width: cellSize * 0.03,
					color: 0x2a1a08,
					alpha: 0.6 * alpha,
				});
			} else {
				const mx = ((link.ax + link.bx) * cellSize) / 2;
				const my = ((link.ay + link.by) * cellSize) / 2;
				const h = cellSize * 0.16;
				const t = cellSize * 0.07;
				if (horizontal) {
					links
						.poly([mx - t, my - h, mx + t, my - h, mx, my - h * 0.15])
						.poly([mx - t, my + h, mx + t, my + h, mx, my + h * 0.15]);
				} else {
					links
						.poly([mx - h, my - t, mx - h, my + t, mx - h * 0.15, my])
						.poly([mx + h, my - t, mx + h, my + t, mx + h * 0.15, my]);
				}
				links.fill({color: 0xb3171d, alpha});
				links
					.moveTo(x1, y1)
					.lineTo(x2, y2)
					.stroke({
						width: cellSize * 0.045,
						color: 0xb3171d,
						alpha: 0.75 * alpha,
					});
			}
		}
	}

	// ------------------------------------------------------------ the washes

	function refreshWash(wash: Container) {
		const bounds = wash.getLocalBounds();
		const side = Math.max(bounds.width, bounds.height, 1);
		wash.cacheAsTexture(false);
		if (wash.children.length === 0) return;
		wash.cacheAsTexture({resolution: Math.min(1, WASH_TEXTURE_MAX / side)});
	}

	// ------------------------------------------------------------ the wood and its lines

	let wood: TilingSprite | undefined;
	let lines: Graphics | undefined;
	let drawnFor: string | undefined;

	function drawBoard(frame: Frame) {
		if (!wood || !lines) return;
		const {transform, screen} = frame;
		if (transform.scale <= 0) return;
		const bounds = visibleCells(transform, screen, 2);
		const key = `${bounds.minX},${bounds.maxX},${bounds.minY},${bounds.maxY},${transform.scale.toFixed(2)}`;
		if (key === drawnFor) return;
		drawnFor = key;

		const x0 = bounds.minX * cellSize;
		const y0 = bounds.minY * cellSize;
		wood.position.set(x0 - cellSize / 2, y0 - cellSize / 2);
		wood.width = (bounds.maxX - bounds.minX + 1) * cellSize;
		wood.height = (bounds.maxY - bounds.minY + 1) * cellSize;
		// the grain is anchored to the board, not to the screen
		wood.tilePosition.set(-(x0 - cellSize / 2), -(y0 - cellSize / 2));

		const pixel = cellSize / transform.scale;
		const spacing = transform.scale;
		const fade = Math.min(1, Math.max(0.15, (spacing - 6) / 30));
		lines.clear();
		for (let x = bounds.minX; x <= bounds.maxX; x++) {
			lines
				.moveTo(x * cellSize, bounds.minY * cellSize)
				.lineTo(x * cellSize, bounds.maxY * cellSize);
		}
		for (let y = bounds.minY; y <= bounds.maxY; y++) {
			lines
				.moveTo(bounds.minX * cellSize, y * cellSize)
				.lineTo(bounds.maxX * cellSize, y * cellSize);
		}
		lines.stroke({
			width: pixel * 1.4,
			color: LINE_INK.color,
			alpha: LINE_INK.alpha * fade,
		});
		if (spacing > 14) {
			const first = (v: number) => Math.ceil(v / HOSHI_EVERY) * HOSHI_EVERY;
			for (let x = first(bounds.minX); x <= bounds.maxX; x += HOSHI_EVERY) {
				for (let y = first(bounds.minY); y <= bounds.maxY; y += HOSHI_EVERY) {
					lines.circle(x * cellSize, y * cellSize, cellSize * 0.07);
				}
			}
			lines.fill({
				color: LINE_INK.color,
				alpha: Math.min(1, LINE_INK.alpha + 0.1) * fade,
			});
		}
	}

	// ------------------------------------------------------------ the pointer

	function gemAt(
		world: Container,
		global: {x: number; y: number},
	): string | undefined {
		const local = world.toLocal(global);
		const key = cellKeyAt({x: local.x / cellSize, y: local.y / cellSize});
		const cell = latest?.cells.get(key);
		return cell && cell.color > 0 && !isGhost(cell) ? key : undefined;
	}

	let unsubscribes: (() => void)[] = [];

	return {
		onAppStarted(world) {
			wood = new TilingSprite({texture: woodTexture(), width: 1, height: 1});
			// one tile spans WOOD_TILE_CELLS intersections
			wood.tileScale.set((WOOD_TILE_CELLS * cellSize) / wood.texture.width);
			lines = new Graphics();
			const factionWash = new Container();
			factionWash.alpha = FACTION_ALPHA;
			const ivoryWash = new Container();
			ivoryWash.alpha = IVORY_ALPHA;
			const links = new Graphics();
			const cellLayer = new Container();
			const fx = new Container();
			world.addChild(wood, lines, factionWash, ivoryWash, links, cellLayer, fx);
			layers = {
				factionWash,
				ivoryWash,
				cells: cellLayer,
				fx,
				links,
				markWashDirty: () => (washDirty = true),
			};

			cells.onAppStarted(layers);
			unsubscribes.push(
				params.viewState.subscribe(($view) => {
					if ($view.step !== 'Loaded') latest = undefined;
					drawLinks();
				}),
				focus.subscribe(($key) => {
					const cell = $key === undefined ? undefined : latest?.cells.get($key);
					const owner = cell?.owner;
					if (owner === focusOwner) return;
					focusOwner = owner;
					restyle = true;
					drawLinks();
				}),
				params.factionWash.subscribe(($on) => {
					factionWash.visible = $on;
					if ($on) washDirty = true;
				}),
			);

			// hover and tap: which gem's owner is lit (P9-5)
			world.eventMode = 'static';
			world.hitArea = new Rectangle(-1e9, -1e9, 2e9, 2e9);
			let pressedAt: {x: number; y: number} | undefined;
			world.on('pointermove', (event) => {
				if (event.pointerType === 'mouse') {
					focus.hover(gemAt(world, event.global), performance.now());
				}
			});
			world.on('pointerleave', () => focus.hover(undefined, performance.now()));
			world.on('pointerdown', (event) => {
				pressedAt = {x: event.global.x, y: event.global.y};
			});
			world.on('pointerup', (event) => {
				if (!pressedAt) return;
				const moved = Math.hypot(
					event.global.x - pressedAt.x,
					event.global.y - pressedAt.y,
				);
				pressedAt = undefined;
				if (moved <= TAP_SLOP) focus.tap(gemAt(world, event.global));
			});
		},

		onAppStopped() {
			for (const stop of unsubscribes) stop();
			unsubscribes = [];
			cells.onAppStopped();
			layers = undefined;
			latest = undefined;
			wood = undefined;
			lines = undefined;
			drawnFor = undefined;
			focusOwner = undefined;
		},

		tick(frame) {
			drawBoard(frame);
			const next = zoomOf(frame.transform.scale);
			if (!sameZoom(next, zoom)) {
				zoom = next;
				restyle = true;
			}
			focus.tick(performance.now());
			cells.tick(frame);
			if (washDirty && layers) {
				washDirty = false;
				refreshWash(layers.ivoryWash);
				if (get(params.factionWash)) refreshWash(layers.factionWash);
			}
		},
	};
}

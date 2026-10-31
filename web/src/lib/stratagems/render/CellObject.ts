/**
 * One cell on the board, as pixi draws it (step 9, P9-3 and P9-5): its gem or
 * husk, the dial or the size, the pulsing mark, the light ring or the red rim,
 * the bezel when it is yours, the planned ghost or cross, the focus ring, and
 * its share of the washes. Every decision is `./look.ts`'s; this file only
 * places sprites.
 *
 * Rebuilt on every change of its cell or of the zoom class: a cell has a
 * handful of sprites, and only changed cells are touched (the template's
 * stateful style, `$lib/game/render/stateful.ts`).
 */
import {Container, Graphics, Sprite, type Texture} from 'pixi.js';
import type {CellView} from '../view';
import {
	crackPaths,
	DYING_MS,
	dyingFrame,
	gemColourNumber,
	isDead,
	isGhost,
	isRemoval,
	marksFilled,
	markAngle,
	pendingMark,
	startsDying,
	stoneScale,
	type Zoom,
} from './look';
import {
	bezelTexture,
	crossTexture,
	focusRingTexture,
	ghostRingTexture,
	glowTexture,
	huskTexture,
	IVORY,
	MARK_RADIUS,
	pendingTexture,
	rimTexture,
	RT,
	stoneTexture,
	washTexture,
} from './textures';

/** What every cell draws into, owned by the board. */
export type BoardLayers = {
	factionWash: Container;
	ivoryWash: Container;
	cells: Container;
	fx: Container;
	/** Set when a wash changed, so the board refreshes its cached texture. */
	markWashDirty(): void;
};

export type CellLook = {
	cellSize: number;
	maxLife: number;
	zoom: Zoom;
	/** The focused owner, when one is focused. */
	focusOwner: string | undefined;
	isLit(cell: CellView): boolean;
};

/** The stone's radius, as a fraction of the distance between intersections. */
const STONE = 0.38;

type Dying = {
	startMs: number | undefined;
	stone: Sprite;
	husk: Sprite;
	cracks: Graphics;
	chips: Graphics;
	paths: ReturnType<typeof crackPaths>;
};

export class CellObject {
	readonly root = new Container();
	private cell: CellView;
	private look: CellLook;
	private pending?: {sprite: Sprite; baseScale: number};
	private ivory?: Sprite;
	private faction?: Sprite;
	private dying?: Dying;

	constructor(
		cell: CellView,
		look: CellLook,
		private readonly layers: BoardLayers,
	) {
		this.cell = cell;
		this.look = look;
		this.root.position.set(cell.x * look.cellSize, cell.y * look.cellSize);
		layers.cells.addChild(this.root);
		this.build();
	}

	/** A new state of the cell: plays the crack when it has just died. */
	update(cell: CellView, look: CellLook): void {
		const previous = this.cell;
		this.cell = cell;
		this.look = look;
		this.endDying();
		this.build();
		if (startsDying(previous, cell)) this.startDying(previous);
	}

	/** The zoom class or the focus changed: draw again, no animation. */
	restyle(look: CellLook): void {
		this.look = look;
		if (this.dying) return; // finishes with the new look
		this.build();
	}

	/** Per frame: the shared pulse, and the crack when one is playing. */
	tick(timeMs: number, pulse: number): void {
		if (this.pending) {
			const {sprite, baseScale} = this.pending;
			sprite.alpha = 0.2 + 0.8 * pulse;
			sprite.scale.set(baseScale * (1 + 0.35 * pulse));
		}
		if (this.dying) this.animateDying(timeMs);
	}

	destroy(): void {
		this.endDying();
		this.ivory?.destroy();
		this.faction?.destroy();
		if (this.ivory || this.faction) this.layers.markWashDirty();
		this.root.destroy({children: true});
	}

	private get k(): number {
		return (STONE * this.look.cellSize) / RT;
	}

	private sprite(texture: Texture, scale: number, parent = this.root): Sprite {
		const sprite = new Sprite(texture);
		sprite.anchor.set(0.5);
		sprite.scale.set(this.k * scale);
		parent.addChild(sprite);
		return sprite;
	}

	private build(): void {
		for (const child of this.root.removeChildren()) child.destroy();
		this.pending = undefined;
		const {cell, look} = this;
		const {zoom, maxLife} = look;
		this.buildWashes();
		if (cell.color === 0) return;

		const ghost = isGhost(cell);
		const scale = stoneScale(cell, zoom, maxLife);
		if (isDead(cell) && !ghost) {
			this.sprite(huskTexture(cell.color), scale);
			this.dim();
			return;
		}

		const trend = ghost ? undefined : cell.trend;
		if (trend === 'grow') this.sprite(glowTexture(), scale * 1.02);
		if (cell.mine && !ghost && zoom.bezel) this.sprite(bezelTexture(), scale);
		if (look.focusOwner !== undefined && look.isLit(cell) && !ghost) {
			this.sprite(focusRingTexture(), scale);
		}
		const marks = zoom.dial && !ghost ? marksFilled(cell) : undefined;
		const stone = this.sprite(
			stoneTexture(cell.color, {marks, maxLife, stake: cell.stake}),
			scale,
		);
		if (ghost) {
			stone.alpha = 0.42;
			this.sprite(ghostRingTexture(cell.color), 1);
		}
		const mark = zoom.dial ? pendingMark(cell, maxLife) : undefined;
		if (mark) {
			const a = markAngle(mark.index, maxLife);
			const radius = STONE * look.cellSize * MARK_RADIUS;
			const sprite = this.sprite(pendingTexture(mark.kind), 1);
			sprite.position.set(Math.cos(a) * radius, Math.sin(a) * radius);
			this.pending = {sprite, baseScale: this.k};
		}
		if (trend === 'shrink') this.sprite(rimTexture(), scale);
		if (isRemoval(cell)) this.sprite(crossTexture(), 0.9);
		this.dim();
	}

	private dim(): void {
		const {look, cell} = this;
		this.root.alpha =
			look.focusOwner === undefined || look.isLit(cell) ? 1 : 0.2;
	}

	/** The ivory wash under your living gems, and the faction wash. */
	private buildWashes(): void {
		const {cell, look} = this;
		const size = 2 * look.cellSize;
		const wantIvory = cell.mine && !isGhost(cell) && cell.life > 0;
		const wantFaction = cell.color > 0 && cell.life > 0 && !isGhost(cell);
		let changed = false;
		if (wantIvory && !this.ivory) {
			this.ivory = this.washSprite(this.layers.ivoryWash, IVORY, size);
			changed = true;
		} else if (!wantIvory && this.ivory) {
			this.ivory.destroy();
			this.ivory = undefined;
			changed = true;
		}
		const tint = gemColourNumber(cell.color);
		if (wantFaction && !this.faction) {
			this.faction = this.washSprite(this.layers.factionWash, tint, size);
			changed = true;
		} else if (!wantFaction && this.faction) {
			this.faction.destroy();
			this.faction = undefined;
			changed = true;
		} else if (this.faction && this.faction.tint !== tint) {
			this.faction.tint = tint;
			changed = true;
		}
		if (changed) this.layers.markWashDirty();
	}

	private washSprite(parent: Container, tint: number, size: number): Sprite {
		const sprite = new Sprite(washTexture());
		sprite.anchor.set(0.5);
		sprite.width = sprite.height = size;
		sprite.tint = tint;
		sprite.position.set(this.root.position.x, this.root.position.y);
		parent.addChild(sprite);
		return sprite;
	}

	// ------------------------------------------------------------ the crack

	private startDying(previous: CellView): void {
		const {look} = this;
		const stone = this.sprite(
			stoneTexture(previous.color, {
				marks: look.zoom.dial ? 0 : undefined,
				maxLife: look.maxLife,
				stake: previous.stake,
			}),
			stoneScale(previous, look.zoom, look.maxLife),
		);
		const husk = this.root.children[0] as Sprite | undefined;
		if (!husk) {
			stone.destroy();
			return;
		}
		husk.alpha = 0;
		const cracks = new Graphics();
		const chips = new Graphics();
		cracks.position.copyFrom(this.root.position);
		chips.position.copyFrom(this.root.position);
		this.layers.fx.addChild(cracks, chips);
		this.dying = {
			startMs: undefined,
			stone,
			husk,
			cracks,
			chips,
			paths: crackPaths(previous.x * 31 + previous.y * 17 + 5),
		};
	}

	private animateDying(timeMs: number): void {
		const dying = this.dying!;
		dying.startMs ??= timeMs;
		const p = (timeMs - dying.startMs) / DYING_MS;
		if (p >= 1) {
			this.endDying();
			this.build();
			return;
		}
		const frame = dyingFrame(p);
		const radius = (STONE * this.look.cellSize * dying.stone.scale.x) / this.k;
		const shake = frame.shake * radius * 0.09;
		dying.stone.position.x = shake;
		dying.cracks.position.x = this.root.position.x + shake;
		const {cracks, chips} = dying;
		cracks.clear();
		for (const path of dying.paths.paths) {
			const upto = frame.cracks * (path.length - 1);
			const whole = Math.floor(upto);
			cracks.moveTo(path[0][0] * radius, path[0][1] * radius);
			for (let i = 1; i <= whole; i++) {
				cracks.lineTo(path[i][0] * radius, path[i][1] * radius);
			}
			if (whole < path.length - 1 && upto > whole) {
				const f = upto - whole;
				const [x0, y0] = path[whole];
				const [x1, y1] = path[whole + 1];
				cracks.lineTo(
					(x0 + (x1 - x0) * f) * radius,
					(y0 + (y1 - y0) * f) * radius,
				);
			}
		}
		cracks.stroke({
			width: radius * 0.07,
			color: 0x140a02,
			alpha: 1 - frame.sink,
			join: 'round',
			cap: 'round',
		});
		chips.clear();
		if (frame.chips > 0) {
			const q = frame.chips;
			const colour = gemColourNumber(this.cell.color);
			dying.paths.paths.forEach((path, i) => {
				const [ex, ey] = path[path.length - 1];
				const a = Math.atan2(ey, ex);
				const cx = (ex + Math.cos(a) * 0.6 * q) * radius;
				const cy = (ey + Math.sin(a) * 0.6 * q + 0.8 * q * q) * radius;
				const r = radius * (0.13 + 0.05 * (i % 3));
				const rot = q * 6 + i;
				chips.poly([
					cx + Math.cos(rot) * r,
					cy + Math.sin(rot) * r,
					cx + Math.cos(rot + 2.2) * r,
					cy + Math.sin(rot + 2.2) * r,
					cx + Math.cos(rot + 4.1) * r * 0.7,
					cy + Math.sin(rot + 4.1) * r * 0.7,
				]);
			});
			chips.fill({color: colour, alpha: 1 - q});
		}
		dying.stone.alpha = 1 - frame.sink;
		dying.husk.alpha = frame.sink;
	}

	private endDying(): void {
		if (!this.dying) return;
		this.dying.cracks.destroy();
		this.dying.chips.destroy();
		this.dying = undefined;
	}
}

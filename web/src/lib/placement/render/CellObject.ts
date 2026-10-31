/**
 * One cell on screen.
 *
 * Draws two things the player needs to tell apart at a glance: what is on
 * chain, and what they have merely planned. The second is the one a
 * commit-reveal game has that an ordinary one does not, and it is drawn as an
 * outline rather than a fill so it never reads as confirmed.
 *
 * Note what is deliberately NOT drawn: which share of a cell is this player's.
 * The contract can answer it (`getStakeOnCell`) but only per cell, and a
 * client-side tally of "what I revealed this session" would be wrong after any
 * reload. Better to show nothing than something that is quietly false.
 *
 * ON THIS BRANCH IT ALSO DRAWS A SPRITE, and that is the point of the sprite
 * rather than decoration. `with/pixi-js` carries an art pipeline, and a
 * pipeline with nothing drawing its output is exactly the unexercised code D11
 * exists to remove - it would type-check, build, emit a manifest and prove
 * nothing. So the one sprite the template ships is the confirmed-cell tile, and
 * this is where it is consumed.
 *
 * The vector fill is kept as the FALLBACK rather than replaced, because an
 * empty manifest is a supported state: a clone without `../assets` builds and
 * runs, and `assets.ts` drives progress to 1 even when the bundle fails. So the
 * board degrades to a plainer picture and never to a broken one, and both paths
 * are reachable in a normal checkout.
 */
import {Container, Graphics, Sprite, type Texture} from 'pixi.js';
import {sprites, spritesReady} from '$lib/game/render/pixi/assets';
import type {CellView} from '../view';

const CONFIRMED_COLOUR = 0x4f8cff;
const PLANNED_COLOUR = 0xffd166;

/** The one sprite this template ships. See `assets/sprites/`. */
const CELL_TEXTURE = 'cell.png';

/**
 * The tile, or undefined if there is no art.
 *
 * Asked per construction rather than cached at module scope: loading starts at
 * module scope but finishes later, so a cell built before the bundle lands
 * would cache `undefined` forever and never show the art, which is the bug the
 * template would otherwise ship to every game that copies this file.
 */
function cellTexture(): Texture | undefined {
	if (!spritesReady()) return undefined;
	return sprites()?.textures[CELL_TEXTURE];
}

export class CellObject extends Container {
	private readonly body: Graphics;
	private readonly outline: Graphics;
	private tile: Sprite | undefined;

	constructor(
		private readonly cellSize: number,
		cell: CellView,
	) {
		super();
		this.body = new Graphics();
		this.outline = new Graphics();
		this.addChild(this.body);
		this.addChild(this.outline);
		this.update(cell);
	}

	/**
	 * Called only when something visible actually changed.
	 *
	 * Redrawing a `Graphics` on every state emit is the easy way to make a pixi
	 * scene slow, so this used to guard itself with a hand-built key string
	 * (`${stake}:${claimants}:${planned}`). That guard now lives in the renderer
	 * as a typed comparison, which is the same idea without the failure mode:
	 * a field left out of a key string is silent, and shows up as a cell that
	 * simply never updates.
	 */
	update(cell: CellView) {
		this.x = cell.position.x * this.cellSize;
		this.y = cell.position.y * this.cellSize;

		const size = this.cellSize;
		const half = size / 2;
		const claimed = cell.numClaimants > 0;
		// Contested cells are shared, not won: the mark shows there is stake
		// here, and the opacity is what says how many players are on it. Same
		// rule, and the same numbers, as the immediate renderer on `main`.
		const alpha = Math.min(0.35 + 0.2 * cell.numClaimants, 0.95);

		const texture = claimed ? cellTexture() : undefined;

		this.body.clear();
		if (claimed && !texture) {
			const inset = size * 0.15;
			this.body
				.rect(-half + inset, -half + inset, size - 2 * inset, size - 2 * inset)
				.fill({color: CONFIRMED_COLOUR, alpha});
		}

		if (texture) {
			if (!this.tile) {
				this.tile = new Sprite(texture);
				this.tile.anchor.set(0.5);
				// Behind the outline, so a planned mark on a claimed cell still
				// reads: `addChildAt` rather than `addChild` because the outline is
				// already there.
				this.addChildAt(this.tile, 0);
			}
			this.tile.texture = texture;
			this.tile.width = size * 0.7;
			this.tile.height = size * 0.7;
			this.tile.alpha = alpha;
			this.tile.visible = true;
		} else if (this.tile) {
			this.tile.visible = false;
		}

		this.outline.clear();
		if (cell.planned) {
			this.outline
				.rect(-half, -half, size, size)
				.stroke({color: PLANNED_COLOUR, width: 2, alignment: 0.5});
		}
	}

	onRemoved() {
		this.body.destroy();
		this.outline.destroy();
		// The texture belongs to the shared spritesheet and must NOT be destroyed
		// with the sprite: every other cell is drawing from it.
		this.tile?.destroy({texture: false, children: false});
		this.tile = undefined;
	}
}

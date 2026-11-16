/**
 * THROWAWAY PROTOTYPE. What happens, played once rather than looped: at a
 * turn, every living spirit fires one volley at its enemies, then the land
 * changes, then motes rise where life came, embers fall where it went, and
 * dust where a cell died. And the focused cell: its fights, in and out,
 * looping only while it is focused.
 */
import * as THREE from 'three';
import {FxBuilder, fxGlow, fxSmoke} from './fx';
import {pushAttacks, pushLifeChange} from './overlays';
import {key, type Board, type Grid} from './rules';
import type {Terrain} from './terrain';

export const VOLLEY_S = 0.9;

export class Events {
	readonly group = new THREE.Group();
	private items: {obj: THREE.Points; end: number}[] = [];
	private focusObj?: THREE.Points;
	private focusKey?: string;

	private add(fx: FxBuilder, end: number, smoke = false) {
		const p = fx.build(smoke ? fxSmoke : fxGlow);
		if (!p) return;
		p.frustumCulled = false;
		this.group.add(p);
		this.items.push({obj: p, end});
	}

	/** One volley from every living spirit, starting at `now` (seconds). */
	volley(board: Board, terrain: Terrain, variant: 'A' | 'B', now: number) {
		const fx = new FxBuilder();
		for (const c of board.values()) if (c.life > 0) pushAttacks(board, terrain, variant, c, fx, {start: now, duration: VOLLEY_S});
		this.add(fx, now + VOLLEY_S + 0.6);
	}

	/** What changed between two boards, played from `now`. */
	changes(prev: Grid, grid: Grid, terrain: Terrain, now: number) {
		const glow = new FxBuilder(),
			dust = new FxBuilder();
		const once = {start: now, duration: 1.4};
		for (const c of grid.board.values()) {
			const before = prev.board.get(key(c.x, c.y));
			const was = before && before.color === c.color ? before.life : 0;
			if (c.life > was) pushLifeChange(terrain, c, 'grow', glow, once);
			else if (c.life < was) pushLifeChange(terrain, c, c.life === 0 ? 'death' : 'shrink', c.life === 0 ? dust : glow, once);
		}
		this.add(glow, now + 2.2);
		this.add(dust, now + 2.2, true);
	}

	/** The focused cell's fights, looping, in and out; none for `undefined`. */
	focus(k: string | undefined, board: Board, terrain: Terrain, variant: 'A' | 'B') {
		if (k === this.focusKey) return;
		this.focusKey = k;
		if (this.focusObj) {
			this.group.remove(this.focusObj);
			this.focusObj.geometry.dispose();
			this.focusObj = undefined;
		}
		const c = k ? board.get(k) : undefined;
		if (!c) return;
		const fx = new FxBuilder();
		if (c.life > 0) pushAttacks(board, terrain, variant, c, fx);
		for (const [dx, dy] of [
			[0, -1],
			[1, 0],
			[0, 1],
			[-1, 0],
		]) {
			const n = board.get(key(c.x + dx, c.y + dy));
			if (n && n.life > 0) pushAttacks(board, terrain, variant, n, fx, undefined, c);
		}
		this.focusObj = fx.build(fxGlow);
		if (this.focusObj) this.group.add(this.focusObj);
	}

	/** Drop what has finished playing. */
	update(now: number) {
		this.items = this.items.filter((it) => {
			if (now < it.end) return true;
			this.group.remove(it.obj);
			it.obj.geometry.dispose();
			return false;
		});
	}

	clear() {
		this.focus(undefined, new Map(), undefined as unknown as Terrain, 'A');
		this.update(Infinity);
	}
}

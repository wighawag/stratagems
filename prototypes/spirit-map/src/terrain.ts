/**
 * THROWAWAY PROTOTYPE. What both terrain variants offer the rest of the map.
 */
import * as THREE from 'three';
import type {Grid} from './rules';

export const SEABED = -0.38;
export const CHUNK = 16;

export interface Terrain {
	readonly group: THREE.Group;
	/** Build for `grid`; heights animate from `prev` (missing land rises from the sea). */
	build(grid: Grid, prev?: Grid): void;
	/** 0 shows the previous heights, 1 the new ones. */
	setMorph(t: number): void;
	/** The ground's height at a point, on the current grid. */
	heightAt(x: number, z: number): number;
	dispose(): void;
}

/** The chunks (by `cx,cy` in chunk units) that hold any cell of the grid. */
export function chunksOf(grid: Grid, margin = 1): Set<string> {
	const out = new Set<string>();
	for (const c of grid.board.values()) {
		for (let dx = -margin; dx <= margin; dx++)
			for (let dy = -margin; dy <= margin; dy++) {
				out.add(`${Math.floor((c.x + dx) / CHUNK)},${Math.floor((c.y + dy) / CHUNK)}`);
			}
	}
	return out;
}

/** Shared uniforms every animated material reads. */
export const uniforms = {
	uTime: {value: 0},
	uMorph: {value: 1},
};

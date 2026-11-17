/**
 * THROWAWAY PROTOTYPE. A faction is a biome, keeping the legacy hue so the
 * colour still reads at a glance (`web/src/lib/stratagems/faction.ts`).
 */
import * as THREE from 'three';

export type Biome = {
	name: string;
	faction: string;
	/** The faction's legacy hue. */
	hue: string;
	/** Ground colours: low and sparse (life 1), high and lush (life 7). */
	sparse: string;
	lush: string;
	/** The colour at the top of the relief (snow, ice, mesa top, ash). */
	peak: string;
	/** The spirit's glow. */
	spirit: string;
	/** Props: trees, crystals, wheat... */
	prop: string;
	prop2: string;
	/** Beach. */
	shore: string;
};

export const BIOMES: Record<number, Biome> = {
	1: {
		name: 'Glacier',
		faction: 'Blue',
		hue: '#5ab9bb',
		sparse: '#7fb9b8',
		lush: '#5fc4cf',
		peak: '#eef8fa',
		spirit: '#7ff6ff',
		prop: '#bff3fb',
		prop2: '#6fd4e6',
		shore: '#d9eef0',
	},
	2: {
		name: 'Mesa',
		faction: 'Red',
		hue: '#c5836e',
		sparse: '#b9876f',
		lush: '#cf6f4f',
		peak: '#e2a27f',
		spirit: '#ff8a5c',
		prop: '#6f8f4a',
		prop2: '#9a4d36',
		shore: '#e6c39a',
	},
	3: {
		name: 'Forest',
		faction: 'Green',
		hue: '#8bffcb',
		sparse: '#86b86f',
		lush: '#3f9f5a',
		peak: '#5fb86a',
		spirit: '#8bffcb',
		prop: '#2f7a46',
		prop2: '#5a3f2a',
		shore: '#e8d9a8',
	},
	4: {
		name: 'Plains',
		faction: 'Yellow',
		hue: '#d3d66d',
		sparse: '#c2bf74',
		lush: '#d9d34f',
		peak: '#e8e07a',
		spirit: '#fff27a',
		prop: '#e8c94f',
		prop2: '#9fae3f',
		shore: '#ece0ad',
	},
	5: {
		name: 'Mountains',
		faction: 'Purple',
		hue: '#a9799d',
		sparse: '#8d7a88',
		lush: '#9a6a92',
		peak: '#f4eef4',
		spirit: '#e3a6ff',
		prop: '#c58ae0',
		prop2: '#6f5a6a',
		shore: '#d8cfc6',
	},
	6: {
		name: 'Volcano',
		faction: 'Evil',
		hue: '#3d3d3d',
		sparse: '#3a3433',
		lush: '#2a2626',
		peak: '#4a4040',
		spirit: '#ff5a1f',
		prop: '#1f1b1b',
		prop2: '#ff6a2a',
		shore: '#3f3a38',
	},
};

/** The wash under your cells, as on the Go board. */
export const IVORY = new THREE.Color('#fff4d8');
export const DEAD = new THREE.Color('#8a847a');
export const SCORCH = new THREE.Color('#4a3530');
export const LAVA = new THREE.Color('#ff5a1f');
export const SEABED_SHALLOW = new THREE.Color('#7fd0c4');
export const SEABED_DEEP = new THREE.Color('#2a6f8f');
export const SEA = new THREE.Color('#2f86b3');
export const SKY = new THREE.Color('#1c5a82');

const cache = new Map<string, THREE.Color>();
export function col(hex: string): THREE.Color {
	let c = cache.get(hex);
	if (!c) cache.set(hex, (c = new THREE.Color(hex)));
	return c;
}

/** The ground colour for a biome at a life, before relief and shading. */
export function groundColour(color: number, life: number, out = new THREE.Color()): THREE.Color {
	const b = BIOMES[color];
	if (!b) return out.copy(DEAD);
	if (life <= 0) return out.copy(col(b.sparse)).lerp(DEAD, 0.72);
	return out.copy(col(b.sparse)).lerp(col(b.lush), (life - 1) / 6);
}

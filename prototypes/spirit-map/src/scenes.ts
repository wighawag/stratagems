/**
 * THROWAWAY PROTOTYPE. Boards to look at: every state laid out (showcase), a
 * small living world (skirmish), and the mobile budget (20,000 cells).
 */
import {EVIL, key, ME, noise, rng, type Board, type Cell, type Plans} from './rules';

export type Scene = {board: Board; plans: Plans; focus: [number, number]; zoom: number};

const others = ['0xa1', '0xb2', '0xc3', '0xd4', '0xe5', '0xf6', '0x17', '0x28', '0x39'];

function put(board: Board, x: number, y: number, color: number, life: number, owner = others[(x * 7 + y * 3) % others.length], stake = 1) {
	const c: Cell = {x, y, color, life, owner, stake};
	board.set(key(x, y), c);
}

export function showcase(): Scene {
	const board: Board = new Map();
	const plans: Plans = new Map();
	const r = rng(7);
	// each biome: life 1 to 7 alone (always growing), then a merged territory
	for (let k = 1; k <= 5; k++) {
		const y = (k - 1) * 3;
		for (let l = 1; l <= 7; l++) put(board, (l - 1) * 2, y, k, l);
		for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 2; dy++) put(board, 15 + dx, y + dy, k, 3 + Math.floor(r() * 5), k === 3 ? ME : undefined);
	}
	// a battlefield: two fronts
	for (let x = 22; x < 32; x++)
		for (let y = 0; y < 9; y++) {
			const wave = Math.sin(y * 0.9) * 1.5;
			const color = x < 26 + wave ? 2 : x < 29 + wave * 0.5 ? 3 : 5;
			if (r() < 0.12) continue;
			const life = Math.floor(r() * 8);
			put(board, x, y, color, life, color === 3 && r() < 0.5 ? ME : undefined);
		}
	// the dead stay, and still count: a dead husk of each biome, one inside a living group
	for (let k = 1; k <= 5; k++) put(board, (k - 1) * 2, 15, k, 0);
	put(board, 12, 15, 3, 0);
	put(board, 13, 15, 3, 5);
	put(board, 11, 15, 3, 4);
	put(board, 12, 16, 4, 6);
	// volcanoes: one plume per gem at stake
	for (let i = 0; i < 4; i++) put(board, i * 3, 19, EVIL, 2 + i, '0xffff', 2 + i);
	// a volcano at the edge of a forest
	put(board, 14, 19, EVIL, 4, '0xffff', 3);
	put(board, 15, 19, 3, 6, ME);
	put(board, 16, 19, 3, 7, ME);
	put(board, 15, 20, 3, 5, ME);
	// your planned moves: two placements and a removal
	plans.set(key(18, 19), 3);
	plans.set(key(18, 20), 3);
	plans.set(key(16, 19), 0);
	return {board, plans, focus: [13, 12], zoom: 36};
}

export function world(w: number, h: number, seed: number, density = 0.62): Board {
	const r = rng(seed);
	const board: Board = new Map();
	const seeds: {x: number; y: number; color: number}[] = [];
	const n = Math.max(6, Math.floor((w * h) / 180));
	for (let i = 0; i < n; i++) seeds.push({x: r() * w, y: r() * h, color: r() < 0.08 ? EVIL : 1 + (i % 5)});
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const v = noise(x * 0.09, y * 0.09, seed) * 0.7 + noise(x * 0.25, y * 0.25, seed + 1) * 0.3;
			if (v < 1 - density * 2) continue;
			let best = 0,
				bd = Infinity;
			for (const s of seeds) {
				const d = (s.x - x) ** 2 + (s.y - y) ** 2 + r() * 6;
				if (d < bd) {
					bd = d;
					best = s.color;
				}
			}
			const life = r() < 0.08 ? 0 : 1 + Math.floor(r() * 7);
			const owner = best === EVIL ? '0xffff' : r() < 0.1 ? ME : others[Math.floor(r() * others.length)];
			put(board, x, y, best, life, owner, best === EVIL ? 2 + Math.floor(r() * 4) : 1);
		}
	return board;
}

export function skirmish(): Scene {
	return {board: world(44, 32, 3), plans: new Map(), focus: [22, 16], zoom: 30};
}

export function stress(): Scene {
	return {board: world(178, 178, 5), plans: new Map(), focus: [89, 89], zoom: 60};
}

export const SCENES: Record<string, () => Scene> = {showcase, skirmish, stress};

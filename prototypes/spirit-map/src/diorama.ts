/**
 * THROWAWAY PROTOTYPE. Variant B, "Diorama": every cell is a chunky low-poly
 * pillar of land standing in the sea, its biome's feature on top (a peak, a
 * mesa step, an ice dome, a crater). Same-colour neighbours are joined by a
 * land bridge at the lower of their heights (and a 2x2 block of one colour
 * fills its middle), so a faction's territory reads as one piece; two colours
 * touching keep the channel of sea between them, where their spirits fight.
 */
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {BIOMES, col, DEAD, groundColour, LAVA} from './biomes';
import {hash2, ME, type Grid} from './rules';
import {CHUNK, uniforms, type Terrain} from './terrain';

const BOTTOM = -0.6;

export function tileTop(life: number): number {
	return life <= 0 ? 0.05 : 0.1 + 0.05 * life;
}

/** Colours a non-indexed geometry by each face's centroid height. */
function paint(geo: THREE.BufferGeometry, by: (y: number, x: number, z: number) => THREE.Color): THREE.BufferGeometry {
	const g = geo.index ? geo.toNonIndexed() : geo;
	const p = g.getAttribute('position');
	const c = new Float32Array(p.count * 3);
	for (let f = 0; f < p.count; f += 3) {
		const y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
		const x = (p.getX(f) + p.getX(f + 1) + p.getX(f + 2)) / 3;
		const z = (p.getZ(f) + p.getZ(f + 1) + p.getZ(f + 2)) / 3;
		const k = by(y, x, z);
		for (let v = 0; v < 3; v++) c.set([k.r, k.g, k.b], (f + v) * 3);
	}
	g.setAttribute('color', new THREE.BufferAttribute(c, 3));
	g.deleteAttribute('normal');
	g.deleteAttribute('uv');
	return g;
}

const shade = (y: number) => new THREE.Color(1, 1, 1).multiplyScalar(y > -0.001 ? 1 : y > -0.06 ? 0.82 : 0.58);

function columnGeometry(): THREE.BufferGeometry {
	const s = Math.SQRT2;
	const lathe = new THREE.LatheGeometry(
		[new THREE.Vector2(0, -1), new THREE.Vector2(0.475 * s, -1), new THREE.Vector2(0.445 * s, -0.05), new THREE.Vector2(0.415 * s, 0), new THREE.Vector2(0, 0)],
		4,
		Math.PI / 4,
	);
	return paint(lathe, shade);
}

function boxGeometry(): THREE.BufferGeometry {
	const b = new THREE.BoxGeometry(1, 1, 1).translate(0, -0.5, 0);
	return paint(b, shade);
}

type CapKind = 'glacier' | 'mesa' | 'mountain' | 'volcano';

function capGeometry(kind: CapKind, color: number, dead: boolean): THREE.BufferGeometry {
	const b = BIOMES[color];
	const tint = (c: THREE.Color) => (dead ? c.clone().lerp(DEAD, 0.72) : c.clone());
	switch (kind) {
		case 'glacier': {
			const g = new THREE.SphereGeometry(0.37, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
			return paint(g, (y) => tint(y > 0.22 ? col(b.peak) : col(b.lush).clone().lerp(col(b.peak), 0.5)));
		}
		case 'mesa': {
			const a = new THREE.BoxGeometry(0.62, 0.12, 0.6).translate(0, 0.06, 0);
			const c = new THREE.BoxGeometry(0.4, 0.12, 0.38).translate(0.03, 0.18, -0.02);
			const m = mergeGeometries([a.toNonIndexed(), c.toNonIndexed()])!;
			return paint(m, (y) => tint(y > 0.235 || (y > 0.115 && y < 0.125) ? col(b.peak) : Math.floor(y / 0.06) % 2 ? col('#9a4f3a') : col(b.lush)));
		}
		case 'mountain': {
			const g = new THREE.ConeGeometry(0.36, 1, 5).translate(0, 0.5, 0);
			return paint(g, (y) => tint(y > 0.55 ? col(b.peak) : y > 0.25 ? col('#7a6a78') : col(b.lush)));
		}
		case 'volcano': {
			const g = new THREE.LatheGeometry(
				[new THREE.Vector2(0.4, 0), new THREE.Vector2(0.22, 0.24), new THREE.Vector2(0.14, 0.38), new THREE.Vector2(0.1, 0.22), new THREE.Vector2(0, 0.22)],
				7,
			);
			return paint(g, (y, x, z) => tint(y < 0.3 && Math.hypot(x, z) < 0.12 ? LAVA : y > 0.3 ? col('#4a4040') : col(b.lush)));
		}
	}
}

const CAP_OF: Record<number, CapKind | undefined> = {1: 'glacier', 2: 'mesa', 5: 'mountain', 6: 'volcano'};

let material: THREE.MeshStandardMaterial | undefined;
function tileMaterial(): THREE.MeshStandardMaterial {
	return (material ??= new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0}));
}

type Rec = {x: number; z: number; from: number; to: number; sx: number; sz: number; rot: number; kind: 'pillar' | 'cap'; hs: number};

type Batch = {mesh: THREE.InstancedMesh; recs: Rec[]};

export class DioramaTerrain implements Terrain {
	readonly group = new THREE.Group();
	private grid?: Grid;
	private batches: Batch[] = [];
	private geos = new Map<string, THREE.BufferGeometry>();

	private geo(name: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
		let g = this.geos.get(name);
		if (!g) this.geos.set(name, (g = make()));
		return g;
	}

	build(grid: Grid, prev?: Grid): void {
		this.clear();
		this.grid = grid;
		const topOf = (g: Grid | undefined, x: number, y: number) => {
			if (!g) return undefined;
			const c = g.colorAt(x, y);
			return c ? tileTop(g.lifeAt(x, y)) : BOTTOM;
		};
		// per chunk, per mesh key: records
		const chunks = new Map<string, Map<string, {geo: THREE.BufferGeometry; colored: boolean; recs: (Rec & {color?: THREE.Color})[]}>>();
		const add = (cx: number, cy: number, name: string, geo: () => THREE.BufferGeometry, colored: boolean, rec: Rec & {color?: THREE.Color}) => {
			const ck = `${Math.floor(cx / CHUNK)},${Math.floor(cy / CHUNK)}`;
			let m = chunks.get(ck);
			if (!m) chunks.set(ck, (m = new Map()));
			let e = m.get(name);
			if (!e) m.set(name, (e = {geo: this.geo(name, geo), colored, recs: []}));
			e.recs.push(rec);
		};
		const ground = new THREE.Color();
		for (const c of grid.board.values()) {
			const to = tileTop(c.life);
			const from = topOf(prev, c.x, c.y) ?? to;
			const h = hash2(c.x, c.y, 11);
			add(c.x, c.y, 'column', columnGeometry, true, {
				x: c.x,
				z: c.y,
				from,
				to,
				sx: 0.97 + 0.06 * h,
				sz: 0.97 + 0.06 * hash2(c.x, c.y, 12),
				rot: 0,
				kind: 'pillar',
				hs: 1,
				color: grid.wash && c.owner === ME ? groundColour(c.color, c.life, ground).clone().offsetHSL(0, 0.08, 0.06) : groundColour(c.color, c.life, ground).clone(),
			});
			const cap = CAP_OF[c.color];
			if (cap) {
				const dead = c.life <= 0;
				const lifeK = dead ? 0.35 : 0.35 + c.life / 10;
				const hs = cap === 'mountain' ? (0.12 + 0.07 * c.life) * (dead ? 0.6 : 1) : cap === 'volcano' ? 0.7 + 0.12 * c.life : cap === 'glacier' ? 0.5 * lifeK : 0.6 + c.life * 0.08;
				const wide = cap === 'volcano' ? 0.85 + 0.06 * Math.min(c.stake, 6) : 1;
				add(c.x, c.y, `cap-${cap}-${c.color}-${dead}`, () => capGeometry(cap, c.color, dead), false, {
					x: c.x,
					z: c.y,
					from,
					to,
					sx: wide,
					sz: wide,
					rot: Math.floor(h * 4) * (Math.PI / 2) + (cap === 'mountain' ? h : 0),
					kind: 'cap',
					hs,
				});
			}
			// bridges to the right and below, a fill in the middle of a 2x2 of one colour
			for (const [dx, dy] of [
				[1, 0],
				[0, 1],
			]) {
				if (grid.colorAt(c.x + dx, c.y + dy) !== c.color) continue;
				const o = tileTop(grid.lifeAt(c.x + dx, c.y + dy));
				const ofrom = topOf(prev, c.x + dx, c.y + dy) ?? o;
				add(c.x, c.y, 'box', boxGeometry, true, {
					x: c.x + dx / 2,
					z: c.y + dy / 2,
					from: Math.min(from, ofrom) - 0.015,
					to: Math.min(to, o) - 0.015,
					sx: dx ? 0.3 : 0.6,
					sz: dy ? 0.3 : 0.6,
					rot: 0,
					kind: 'pillar',
					hs: 1,
					color: groundColour(c.color, Math.min(c.life, grid.lifeAt(c.x + dx, c.y + dy)), ground).clone(),
				});
			}
			if (grid.colorAt(c.x + 1, c.y) === c.color && grid.colorAt(c.x, c.y + 1) === c.color && grid.colorAt(c.x + 1, c.y + 1) === c.color) {
				const lives = [c.life, grid.lifeAt(c.x + 1, c.y), grid.lifeAt(c.x, c.y + 1), grid.lifeAt(c.x + 1, c.y + 1)];
				const m = Math.min(...lives);
				add(c.x, c.y, 'box', boxGeometry, true, {
					x: c.x + 0.5,
					z: c.y + 0.5,
					from: from - 0.02,
					to: tileTop(m) - 0.02,
					sx: 0.4,
					sz: 0.4,
					rot: 0,
					kind: 'pillar',
					hs: 1,
					color: groundColour(c.color, m, ground).clone(),
				});
			}
		}
		for (const m of chunks.values()) {
			for (const e of m.values()) {
				const mesh = new THREE.InstancedMesh(e.geo, tileMaterial(), e.recs.length);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				if (e.colored) e.recs.forEach((r, i) => mesh.setColorAt(i, r.color!));
				const batch = {mesh, recs: e.recs};
				this.batches.push(batch);
				this.place(batch, 1);
				mesh.computeBoundingSphere();
				this.group.add(mesh);
			}
		}
	}

	private place(b: Batch, t: number) {
		const m = new THREE.Matrix4(),
			q = new THREE.Quaternion(),
			p = new THREE.Vector3(),
			s = new THREE.Vector3(),
			up = new THREE.Vector3(0, 1, 0);
		b.recs.forEach((r, i) => {
			const top = r.from + (r.to - r.from) * t;
			p.set(r.x, top, r.z);
			q.setFromAxisAngle(up, r.rot);
			if (r.kind === 'pillar') s.set(r.sx, top - BOTTOM, r.sz);
			else s.set(r.sx, r.hs, r.sz);
			b.mesh.setMatrixAt(i, m.compose(p, q, s));
		});
		b.mesh.instanceMatrix.needsUpdate = true;
	}

	setMorph(t: number): void {
		uniforms.uMorph.value = t;
		for (const b of this.batches) if (b.recs.some((r) => r.from !== r.to)) this.place(b, t);
	}

	heightAt(x: number, z: number): number {
		if (!this.grid) return 0;
		const cx = Math.round(x),
			cy = Math.round(z);
		const c = this.grid.colorAt(cx, cy);
		return c ? tileTop(this.grid.lifeAt(cx, cy)) : 0;
	}

	private clear() {
		for (const b of this.batches) b.mesh.dispose();
		this.batches = [];
		this.group.clear();
	}

	dispose(): void {
		this.clear();
	}
}

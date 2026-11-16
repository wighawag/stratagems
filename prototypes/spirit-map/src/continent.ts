/**
 * THROWAWAY PROTOTYPE. Variant A, "Continent": one continuous low-poly
 * heightfield. Every cell is a bump of land blended with its neighbours, so
 * same-colour neighbours merge into one landmass (the bridge), an empty cell is
 * seabed (the coast comes for free, and an island grows with its life), and two
 * different colours touching dig a scorched rift along their shared edge (the
 * notch, the front line). Flat-shaded, vertex-coloured, in chunks of 16x16
 * cells so the camera culls what it does not see.
 */
import * as THREE from 'three';
import {BIOMES, col, groundColour, SCORCH, SEABED_DEEP, SEABED_SHALLOW} from './biomes';
import {hash2, noise, type Grid} from './rules';
import {CHUNK, chunksOf, SEABED, uniforms, type Terrain} from './terrain';

const KERNEL = 1.05;

export function landHeight(color: number, life: number): number {
	if (life <= 0) return 0.09;
	return 0.16 + 0.035 * life + (color === 2 ? 0.05 : 0);
}

export function craterRadius(stake: number): number {
	return 0.15 + 0.03 * Math.min(stake, 6);
}

function shape(color: number, life: number, stake: number, dx: number, dz: number, wx: number, wz: number, cx: number, cy: number): number {
	const r = Math.hypot(dx, dz);
	const n = noise(wx * 2.3, wz * 2.3, color);
	if (life <= 0) return 0.02 * n;
	switch (color) {
		case 1: {
			const q = Math.min(1, (r / 0.65) ** 2);
			return (0.04 + 0.014 * life) * (1 - q) + 0.02 * n;
		}
		case 2: {
			const q = Math.min(1, (r / 0.55) ** 4);
			return 0.07 * (1 - q) + 0.02 * n;
		}
		case 3:
			return 0.03 * n + 0.025 * noise(wx * 5, wz * 5, 7);
		case 4:
			return 0.012 * n;
		case 5: {
			const k = 0.85 + 0.3 * hash2(cx, cy, 5);
			return (0.1 + 0.07 * life) * k * Math.max(0, 1 - r / 0.6) ** 1.3 + 0.045 * n;
		}
		case 6: {
			const cone = (rr: number) => (0.14 + 0.05 * life + 0.03 * Math.min(stake, 6)) * Math.max(0, 1 - rr / 0.62);
			const rc = craterRadius(stake);
			if (r < rc) return cone(rc) - 0.17 * (1 - r / rc) ** 0.6;
			return cone(r) + 0.015 * n;
		}
	}
	return 0;
}

export type Sample = {
	h: number;
	/** The nearest land cell (0 colour when none within reach). */
	c1: number;
	l1: number;
	s1: number;
	x1: number;
	y1: number;
	d1: number;
	rift: number;
};

export function sample(grid: Grid, u: number, v: number, out: Sample): Sample {
	const fx = Math.floor(u),
		fy = Math.floor(v);
	let sum = 0,
		ws = 0;
	let d1 = 9,
		d2 = 9,
		c1 = 0,
		c2 = 0,
		x1 = 0,
		y1 = 0,
		x2 = 0,
		y2 = 0,
		l1 = 0,
		s1 = 0;
	for (let cy = fy - 1; cy <= fy + 2; cy++) {
		for (let cx = fx - 1; cx <= fx + 2; cx++) {
			const dx = u - cx,
				dz = v - cy;
			const d = Math.hypot(dx, dz);
			if (d >= KERNEL + 0.5) continue;
			const i = grid.index(cx, cy);
			const c = i < 0 ? 0 : grid.color[i];
			if (c !== 0) {
				if (d < d1) {
					d2 = d1;
					c2 = c1;
					x2 = x1;
					y2 = y1;
					d1 = d;
					c1 = c;
					x1 = cx;
					y1 = cy;
					l1 = grid.life[i];
					s1 = grid.stake[i];
				} else if (d < d2) {
					d2 = d;
					c2 = c;
					x2 = cx;
					y2 = cy;
				}
			}
			if (d >= KERNEL) continue;
			const w = (1 - d / KERNEL) ** 2;
			const H = c === 0 ? SEABED : landHeight(c, grid.life[i]) + shape(c, grid.life[i], grid.stake[i], dx, dz, u, v, cx, cy);
			sum += w * H;
			ws += w;
		}
	}
	let h = ws > 0 ? sum / ws : SEABED;
	let rift = 0;
	if (c1 && c2 && c1 !== c2 && Math.abs(x1 - x2) + Math.abs(y1 - y2) === 1) {
		rift = Math.max(0, 1 - (d2 - d1) / 0.24) ** 2;
		h -= 0.15 * rift;
	}
	if (c1 === 2 && l1 > 0 && h > 0.06) h = 0.06 + Math.floor((h - 0.06) / 0.06) * 0.06;
	out.h = h;
	out.c1 = c1;
	out.l1 = l1;
	out.s1 = s1;
	out.x1 = x1;
	out.y1 = y1;
	out.d1 = d1;
	out.rift = rift;
	return out;
}

const tmp = new THREE.Color();

export function faceColour(s: Sample, u: number, v: number, out: THREE.Color): THREE.Color {
	const {h, c1, l1} = s;
	const b = BIOMES[c1];
	if (h < -0.03 || !b) {
		out.copy(SEABED_SHALLOW).lerp(SEABED_DEEP, Math.min(1, (-h - 0.03) / 0.28));
	} else if (h < 0.035) {
		out.copy(col(b.shore));
		if (l1 <= 0) out.lerp(groundColour(c1, 0, tmp), 0.5);
	} else {
		groundColour(c1, l1, out);
		if (l1 > 0) {
			const relief = (h - landHeight(c1, l1)) / 0.35;
			if (c1 === 5 && relief > 0.32) out.copy(col(b.peak));
			else if (c1 === 5 && relief > 0.08) out.lerp(col('#6f6070'), 0.5);
			if (c1 === 1 && relief > 0.08) out.lerp(col(b.peak), Math.min(1, relief * 2));
			if (c1 === 2) {
				const band = Math.floor(h / 0.06) % 2;
				if (band) out.lerp(col('#9a4f3a'), 0.45);
			}
			if (c1 === 6) {
				const r = Math.hypot(u - s.x1, v - s.y1);
				if (r < craterRadius(s.s1) * 1.1) out.copy(col('#1e1817'));
				else if (relief > 0.25) out.lerp(col('#5a4a46'), 0.5);
			}
		}
		if (s.rift > 0.15) out.lerp(SCORCH, Math.min(0.85, s.rift * 1.2));
	}
	const j = 0.93 + 0.14 * hash2(Math.floor(u * 97), Math.floor(v * 89), 3);
	return out.multiplyScalar(j);
}

let material: THREE.MeshStandardMaterial | undefined;
function terrainMaterial(): THREE.MeshStandardMaterial {
	if (material) return material;
	material = new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0});
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uMorph = uniforms.uMorph;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float prevY;\nuniform float uMorph;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y = mix(prevY, transformed.y, uMorph);');
	};
	return material;
}

export class ContinentTerrain implements Terrain {
	readonly group = new THREE.Group();
	private grid?: Grid;
	private s: Sample = {h: 0, c1: 0, l1: 0, s1: 0, x1: 0, y1: 0, d1: 0, rift: 0};

	constructor(private res = 3) {}

	build(grid: Grid, prev?: Grid): void {
		this.dispose();
		this.grid = grid;
		const R = this.res;
		const N = CHUNK * R + 1;
		const s = this.s;
		const c = new THREE.Color();
		for (const k of chunksOf(grid)) {
			const [cx, cy] = k.split(',').map(Number);
			const u0 = cx * CHUNK - 0.5,
				v0 = cy * CHUNK - 0.5;
			const hNew = new Float32Array(N * N);
			const hOld = new Float32Array(N * N);
			for (let j = 0; j < N; j++)
				for (let i = 0; i < N; i++) {
					const u = u0 + i / R,
						v = v0 + j / R;
					hNew[i + j * N] = sample(grid, u, v, s).h;
					hOld[i + j * N] = prev ? sample(prev, u, v, s).h : hNew[i + j * N];
				}
			const tris = (N - 1) * (N - 1) * 2;
			const pos = new Float32Array(tris * 9);
			const colr = new Float32Array(tris * 9);
			const prevY = new Float32Array(tris * 3);
			let t = 0;
			const put = (a: number[], b: number[], d: number[]) => {
				const cu = (a[0] + b[0] + d[0]) / 3,
					cv = (a[1] + b[1] + d[1]) / 3;
				sample(grid, cu, cv, s);
				faceColour(s, cu, cv, c);
				for (const p of [a, b, d]) {
					pos[t * 3] = p[0];
					pos[t * 3 + 1] = p[2];
					pos[t * 3 + 2] = p[1];
					colr[t * 3] = c.r;
					colr[t * 3 + 1] = c.g;
					colr[t * 3 + 2] = c.b;
					prevY[t] = p[3];
					t++;
				}
			};
			for (let j = 0; j < N - 1; j++)
				for (let i = 0; i < N - 1; i++) {
					const P = (ii: number, jj: number) => [u0 + ii / R, v0 + jj / R, hNew[ii + jj * N], hOld[ii + jj * N]];
					const a = P(i, j),
						b = P(i + 1, j),
						cc = P(i + 1, j + 1),
						d = P(i, j + 1);
					if ((i + j) % 2) {
						put(a, d, b);
						put(b, d, cc);
					} else {
						put(a, d, cc);
						put(a, cc, b);
					}
				}
			const geo = new THREE.BufferGeometry();
			geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
			geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
			geo.setAttribute('prevY', new THREE.BufferAttribute(prevY, 1));
			geo.computeBoundingSphere();
			const mesh = new THREE.Mesh(geo, terrainMaterial());
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			this.group.add(mesh);
		}
	}

	setMorph(t: number): void {
		uniforms.uMorph.value = t;
	}

	heightAt(x: number, z: number): number {
		return this.grid ? sample(this.grid, x, z, this.s).h : SEABED;
	}

	dispose(): void {
		for (const m of this.group.children as THREE.Mesh[]) m.geometry.dispose();
		this.group.clear();
	}
}

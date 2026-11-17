/**
 * THROWAWAY PROTOTYPE. Everything on top of the terrain, shared by both
 * variants, in chunks so the camera culls and the zoom thins it out:
 *
 * - props (trees, ice shards, cacti, haystacks, crystals, obsidian): one per
 *   point of life, so a cell's lushness is its life; a dead cell has husks
 * - the standing stones: the dial of seven, close up only; lit up to the life
 *   the cell keeps, the pending one pulsing gold (coming) or red (going)
 * - the spirit: one per living cell, floating, glowing, sized by its life
 * - particles: motes rising where life grows, embers falling where it goes,
 *   bolts flying from each living spirit to every enemy edge, sparks where they
 *   land, smoke above volcanoes (one plume per gem at stake)
 * - your banners, the ghosts of planned placements, the fissures of removals
 */
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {BIOMES, col, DEAD} from './biomes';
import {CHUNK, uniforms, type Terrain} from './terrain';
import {FxBuilder, fxGlow, fxSmoke} from './fx';
import {hash2, key, MAX_LIFE, ME, pressureOf, type Board, type Cell, type Grid, type Plans} from './rules';

export const LOD = {props: 34, stones: 15, spirits: 60, fx: 34, flags: 50, fronts: 60};

function baked(geo: THREE.BufferGeometry, color: string | THREE.Color): THREE.BufferGeometry {
	const g = geo.index ? geo.toNonIndexed() : geo;
	const c = typeof color === 'string' ? col(color) : color;
	const n = g.getAttribute('position').count;
	const arr = new Float32Array(n * 3);
	for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
	g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
	g.deleteAttribute('uv');
	g.deleteAttribute('normal');
	return g;
}

function merge(...parts: THREE.BufferGeometry[]) {
	return mergeGeometries(parts)!;
}

const deadTint = (hex: string) => col(hex).clone().lerp(DEAD, 0.75);

/** One prop geometry per biome, and the husk a dead cell keeps. */
function propGeometry(color: number, dead: boolean): THREE.BufferGeometry {
	const b = BIOMES[color];
	const t = (hex: string) => (dead ? deadTint(hex) : col(hex));
	if (dead) {
		switch (color) {
			case 3:
				return baked(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 5).translate(0, 0.025, 0), '#6a5a4a');
			default:
				return baked(new THREE.DodecahedronGeometry(0.045, 0).scale(1, 0.6, 1), t(b.prop2));
		}
	}
	switch (color) {
		case 1:
			return baked(new THREE.OctahedronGeometry(0.05, 0).scale(1, 2.6, 1).translate(0, 0.1, 0), t(b.prop));
		case 2:
			return merge(
				baked(new THREE.BoxGeometry(0.04, 0.17, 0.04).translate(0, 0.085, 0), t(b.prop)),
				baked(new THREE.BoxGeometry(0.06, 0.03, 0.03).translate(0.04, 0.09, 0), t(b.prop)),
				baked(new THREE.BoxGeometry(0.025, 0.06, 0.025).translate(0.065, 0.12, 0), t(b.prop)),
			);
		case 3:
			return merge(
				baked(new THREE.CylinderGeometry(0.018, 0.024, 0.07, 4).translate(0, 0.035, 0), t(b.prop2)),
				baked(new THREE.ConeGeometry(0.085, 0.16, 5).translate(0, 0.13, 0), t(b.prop)),
				baked(new THREE.ConeGeometry(0.06, 0.12, 5).translate(0, 0.22, 0), col(b.prop).clone().lerp(col('#7fd08a'), 0.3)),
			);
		case 4:
			return merge(
				baked(new THREE.CylinderGeometry(0.06, 0.065, 0.06, 7).translate(0, 0.03, 0), t(b.prop)),
				baked(new THREE.ConeGeometry(0.065, 0.07, 7).translate(0, 0.095, 0), col(b.prop).clone().lerp(col('#fff4b0'), 0.3)),
			);
		case 5:
			return merge(
				baked(new THREE.OctahedronGeometry(0.04, 0).scale(1, 2.4, 1).translate(0, 0.08, 0), t(b.prop)),
				baked(new THREE.OctahedronGeometry(0.028, 0).scale(1, 2.2, 1).rotateZ(0.5).translate(0.04, 0.05, 0), col(b.prop).clone().lerp(col('#ffffff'), 0.3)),
			);
		case 6:
			return baked(new THREE.TetrahedronGeometry(0.06, 0).scale(0.8, 1.8, 0.8).translate(0, 0.06, 0), t(b.prop));
	}
	return baked(new THREE.BoxGeometry(0.05, 0.05, 0.05), '#888888');
}

const geos = new Map<string, THREE.BufferGeometry>();
function cached(name: string, make: () => THREE.BufferGeometry) {
	let g = geos.get(name);
	if (!g) geos.set(name, (g = make()));
	return g;
}

const mats = {
	baked: new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.85}),
	stoneLit: new THREE.MeshStandardMaterial({color: '#f3dd9a', emissive: '#ffb347', emissiveIntensity: 0.55, flatShading: true, roughness: 0.6}),
	stoneOff: new THREE.MeshStandardMaterial({color: '#5d5a57', flatShading: true, roughness: 0.95}),
	stoneGrow: new THREE.MeshStandardMaterial({color: '#fff1b8', emissive: '#ffd24a', emissiveIntensity: 1, flatShading: true}),
	stoneShrink: new THREE.MeshStandardMaterial({color: '#ff8a7a', emissive: '#ff2a1a', emissiveIntensity: 1, flatShading: true}),
	spirit: spiritMaterial(),
	ghost: new THREE.MeshBasicMaterial({transparent: true, opacity: 0.4, depthWrite: false}),
	removal: new THREE.MeshBasicMaterial({color: '#ff3020'}),
	lava: new THREE.MeshBasicMaterial({color: '#ff6a1f'}),
	front: new THREE.MeshBasicMaterial({color: '#ff4a2a', transparent: true, opacity: 0.85}),
	grow: new THREE.MeshBasicMaterial({color: '#ffe066'}),
	shrink: new THREE.MeshBasicMaterial({color: '#ff3b2a'}),
	border: borderMaterial(),
	flag: new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 0.6}),
};

function spiritMaterial() {
	const m = new THREE.MeshStandardMaterial({flatShading: true, roughness: 0.4, color: '#ffffff'});
	m.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = uniforms.uTime;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nuniform float uTime;')
			.replace(
				'#include <begin_vertex>',
				`#include <begin_vertex>
				float sp = instanceMatrix[3].x * 1.3 + instanceMatrix[3].z * 0.7;
				transformed.y += sin(uTime * 1.2 + sp) * 0.12;
				float a = uTime * 0.5 + sp;
				transformed.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * transformed.xz;`,
			);
		shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vColor.rgb * 0.85;');
	};
	return m;
}

/** Called every frame: the pulses. */
export function animateMaterials(t: number) {
	const p = 0.5 + 0.5 * Math.sin(t * 2.2);
	mats.stoneGrow.emissiveIntensity = 0.35 + 0.8 * p;
	mats.stoneShrink.emissiveIntensity = 0.35 + 0.8 * p;
	mats.ghost.opacity = 0.25 + 0.2 * p;
}

/* ---------- the chunk ---------- */

export type Layers = {props: boolean; stones: boolean; spirits: boolean; fx: boolean; attacks: boolean; flags: boolean; ambient: boolean; plans: boolean; fronts: boolean; trend: boolean; border: boolean};

type Chunk = {
	center: THREE.Vector3;
	props: THREE.Group;
	stones: THREE.Group;
	spirits: THREE.Group;
	fx: THREE.Group;
	ambient: THREE.Group;
	attacks: THREE.Group;
	flags: THREE.Group;
	fronts: THREE.Group;
	trend: THREE.Group;
	border: THREE.Group;
};

class Instances {
	m = new Map<string, {geo: THREE.BufferGeometry; mat: THREE.Material; mats: THREE.Matrix4[]; colors?: THREE.Color[]}>();
	add(name: string, geo: () => THREE.BufferGeometry, mat: THREE.Material, matrix: THREE.Matrix4, color?: THREE.Color) {
		let e = this.m.get(name);
		if (!e) this.m.set(name, (e = {geo: cached(name, geo), mat, mats: [], colors: color ? [] : undefined}));
		e.mats.push(matrix);
		if (color) e.colors!.push(color);
	}
	into(group: THREE.Group, shadows = true) {
		for (const e of this.m.values()) {
			const mesh = new THREE.InstancedMesh(e.geo, e.mat, e.mats.length);
			e.mats.forEach((m, i) => mesh.setMatrixAt(i, m));
			e.colors?.forEach((c, i) => mesh.setColorAt(i, c));
			mesh.castShadow = shadows;
			mesh.receiveShadow = shadows;
			if (!e.mat.depthTest) mesh.renderOrder = 3;
			mesh.computeBoundingSphere();
			if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.6;
			group.add(mesh);
		}
	}
}

const q = new THREE.Quaternion();
const up = new THREE.Vector3(0, 1, 0);
function mat(x: number, y: number, z: number, rot = 0, sx = 1, sy = sx, sz = sx) {
	return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(sx, sy, sz));
}

/** Where mark `index` of 7 sits round the cell, from the top of the screen, clockwise. */
function markAngle(index: number): number {
	return -Math.PI / 2 + (index * 2 * Math.PI) / MAX_LIFE;
}

export function sizeOf(life: number): number {
	return 0.42 + (0.58 * Math.max(0, Math.min(life, MAX_LIFE))) / MAX_LIFE;
}

export class Overlays {
	readonly group = new THREE.Group();
	private chunks: Chunk[] = [];
	private plans?: THREE.Group;

	build(grid: Grid, plans: Plans, terrain: Terrain, variant: 'A' | 'B', opts: {lively: boolean}) {
		this.dispose();
		const board = grid.board;
		const per = new Map<string, Board>();
		for (const c of board.values()) {
			const ck = `${Math.floor(c.x / CHUNK)},${Math.floor(c.y / CHUNK)}`;
			let m = per.get(ck);
			if (!m) per.set(ck, (m = new Map()));
			m.set(key(c.x, c.y), c);
		}
		const ringR = variant === 'B' ? 0.36 : 0.4;
		for (const [ck, cells] of per) {
			const [cx, cy] = ck.split(',').map(Number);
			const props = new Instances(),
				stones = new Instances(),
				spirits = new Instances(),
				flags = new Instances(),
				fronts = new Instances(),
				trend = new Instances(),
				border = new BorderBuilder();
			const motes = new FxBuilder(),
				smoke = new FxBuilder(),
				glow = new FxBuilder(),
				bolts = new FxBuilder();
			for (const c of cells.values()) {
				const b = BIOMES[c.color];
				const pr = pressureOf(board, c);
				const dead = c.life <= 0;
				const centre = centreOf(c, terrain, variant);
				// props: one per point of life, two husks when dead
				const count = dead ? 2 : c.life;
				for (let i = 0; i < count; i++) {
					const a = (i / 7) * Math.PI * 2 + hash2(c.x, c.y, i) * 0.8;
					let r = 0.17 + 0.13 * hash2(c.x, c.y, i + 20);
					if (c.color === 6 || (c.color === 5 && variant === 'B')) r += 0.06;
					const px = c.x + Math.cos(a) * r,
						pz = c.y + Math.sin(a) * r;
					const s = 0.8 + 0.5 * hash2(c.x, c.y, i + 40);
					props.add(`prop-${c.color}-${dead}`, () => propGeometry(c.color, dead), mats.baked, mat(px, terrain.heightAt(px, pz) - 0.01, pz, a * 3, s));
				}
				// the dial of seven standing stones
				const filled = dead ? 0 : pr.trend === 'shrink' ? c.life - 1 : c.life;
				const pending = dead ? -1 : pr.trend === 'grow' ? c.life : pr.trend === 'shrink' ? c.life - 1 : -1;
				for (let i = 0; i < MAX_LIFE; i++) {
					const a = markAngle(i);
					const sx = c.x + Math.cos(a) * ringR,
						sz = c.y + Math.sin(a) * ringR;
					const kind = i === pending ? (pr.trend === 'grow' ? 'grow' : 'shrink') : i < filled ? 'lit' : 'off';
					const m = kind === 'grow' ? mats.stoneGrow : kind === 'shrink' ? mats.stoneShrink : kind === 'lit' ? mats.stoneLit : mats.stoneOff;
					const tall = kind === 'off' ? 0.7 : 1;
					stones.add(`stone-${kind}`, () => new THREE.CylinderGeometry(0.02, 0.032, 0.15, 4).translate(0, 0.065, 0), m, mat(sx, terrain.heightAt(sx, sz) - 0.01, sz, a, 1, tall, 1));
				}
				// the spirit
				const spiritY = centre + SPIRIT_UP;
				if (!dead) {
					const s = sizeOf(c.life);
					spirits.add('spirit', () => new THREE.OctahedronGeometry(0.075, 0).scale(1, 1.5, 1), mats.spirit, mat(c.x, spiritY, c.y, 0, s, s, s), col(b.spirit));
					motes.push({x: c.x, y: spiritY, z: c.y}, {x: 0, y: 0, z: 0}, col(b.spirit), hash2(c.x, c.y, 9), 1, 5, 0.22 * s);
					// where its life goes: a gold arrow up, a red arrow down, above the spirit
					if (pr.trend === 'grow') trend.add('arrow-up', arrowGeometry, mats.grow, mat(c.x, spiritY + 0.26, c.y, Math.PI / 4, 1.4));
					else if (pr.trend === 'shrink') trend.add('arrow-down', () => arrowGeometry().rotateX(Math.PI), mats.shrink, mat(c.x, spiritY + 0.26, c.y, Math.PI / 4, 1.4));
				}
				// life coming or going, attacks: looping only when lively (calm plays them once, at the turn)
				if (opts.lively && (pr.trend === 'grow' || pr.trend === 'shrink')) pushLifeChange(terrain, c, pr.trend, motes);
				// volcano: the crater glows, a plume per gem at stake
				if (c.color === 6 && !dead) {
					if (variant === 'A') {
						const cr = 0.15 + 0.03 * Math.min(c.stake, 6);
						let rim = 0;
						for (let i = 0; i < 6; i++) rim += terrain.heightAt(c.x + Math.cos(i) * cr * 0.85, c.y + Math.sin(i) * cr * 0.85) / 6;
						props.add('lava', () => new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2), mats.lava, mat(c.x, rim - 0.015, c.y, 0, cr * 0.9, 1, cr * 0.9));
					}
					glow.push({x: c.x, y: centre + 0.03, z: c.y}, {x: 0, y: 0, z: 0}, col('#ff5a1f'), hash2(c.x, c.y, 3), 1, 5, 0.35 + 0.05 * c.stake);
					for (let i = 0; i < c.stake; i++) {
						for (let k = 0; k < 3; k++) {
							smoke.push({x: c.x + (hash2(c.x, i, 4) - 0.5) * 0.12, y: centre + 0.05, z: c.y + (hash2(c.y, i, 5) - 0.5) * 0.12}, {x: 0, y: 0, z: 0}, col(k % 2 ? '#3a3534' : '#6a6260'), (i * 0.37 + k * 0.33) % 1, 0.11, 3, 0.14);
						}
					}
				}
				if (opts.lively && !dead) pushAttacks(board, terrain, variant, c, bolts);
				// yours: a banner
				if (c.owner === ME) {
					const fx = c.x - 0.3,
						fz = c.y + 0.3;
					flags.add('flag', flagGeometry, mats.flag, mat(fx, terrain.heightAt(fx, fz) - 0.01, fz, 0.3, 1.5));
					addBorder(board, terrain, c, border);
				}
				// the front: a glowing seam on every edge between two colours (each pair once)
				for (const [dx, dy] of [
					[1, 0],
					[0, 1],
				]) {
					const n = board.get(key(c.x + dx, c.y + dy));
					if (!n || n.color === c.color) continue;
					const ex = c.x + dx * 0.5,
						ez = c.y + dy * 0.5;
					for (let k = -1; k <= 1; k++) {
						const px = ex + (dy ? k * 0.28 : 0),
							pz = ez + (dx ? k * 0.28 : 0);
						const h = Math.max(terrain.heightAt(px, pz), variant === 'B' ? Math.min(terrain.heightAt(c.x, c.y), terrain.heightAt(n.x, n.y)) : 0);
						fronts.add('front', () => new THREE.BoxGeometry(0.06, 0.03, 0.27), mats.front, mat(px, h + 0.02, pz, dx ? 0 : Math.PI / 2, 1, 1, 1));
					}
				}
			}
			const chunk: Chunk = {
				center: new THREE.Vector3(cx * CHUNK + CHUNK / 2, 0, cy * CHUNK + CHUNK / 2),
				props: new THREE.Group(),
				stones: new THREE.Group(),
				spirits: new THREE.Group(),
				fx: new THREE.Group(),
				ambient: new THREE.Group(),
				attacks: new THREE.Group(),
				flags: new THREE.Group(),
				fronts: new THREE.Group(),
				trend: new THREE.Group(),
				border: new THREE.Group(),
			};
			props.into(chunk.props);
			stones.into(chunk.stones, false);
			spirits.into(chunk.spirits, false);
			flags.into(chunk.flags);
			fronts.into(chunk.fronts, false);
			trend.into(chunk.trend, false);
			border.into(chunk.border);
			const pm = motes.build(fxGlow);
			if (pm) chunk.fx.add(pm);
			const ps = smoke.build(fxSmoke);
			if (ps) chunk.ambient.add(ps);
			const pg = glow.build(fxGlow);
			if (pg) chunk.ambient.add(pg);
			const pb = bolts.build(fxGlow);
			if (pb) chunk.attacks.add(pb);
			for (const g of [chunk.props, chunk.stones, chunk.spirits, chunk.fx, chunk.ambient, chunk.attacks, chunk.flags, chunk.fronts, chunk.trend, chunk.border]) this.group.add(g);
			this.chunks.push(chunk);
		}
		// planned moves: ghosts and fissures, always shown
		const ghosts = new Instances(),
			removals = new Instances();
		for (const [k, color] of plans) {
			const [x, y] = k.split(',').map(Number);
			const h = Math.max(terrain.heightAt(x, y), 0.02);
			if (color === 0) {
				removals.add('cross-a', () => new THREE.BoxGeometry(0.75, 0.05, 0.09), mats.removal, mat(x, h + 0.06, y, Math.PI / 4));
				removals.add('cross-b', () => new THREE.BoxGeometry(0.75, 0.05, 0.09), mats.removal, mat(x, h + 0.06, y, -Math.PI / 4));
			} else {
				ghosts.add('ghost', () => new THREE.BoxGeometry(0.8, 0.4, 0.8).translate(0, 0.2, 0), mats.ghost, mat(x, Math.max(h, 0), y), col(BIOMES[color].spirit));
				ghosts.add('ghost-spirit', () => new THREE.OctahedronGeometry(0.075, 0).scale(1, 1.5, 1), mats.ghost, mat(x, Math.max(h, 0) + 0.45, y, 0, 0.7), col(BIOMES[color].spirit));
			}
		}
		const always = (this.plans = new THREE.Group());
		ghosts.into(always, false);
		removals.into(always, false);
		this.group.add(always);
	}

	/** Thin out by distance; `layers` are the panel's switches. */
	update(camera: THREE.Camera, layers: Layers) {
		if (this.plans) this.plans.visible = layers.plans;
		const p = camera.position;
		for (const c of this.chunks) {
			const d = Math.max(0, p.distanceTo(c.center) - CHUNK * 0.7);
			c.props.visible = layers.props && d < LOD.props;
			c.stones.visible = layers.stones && d < LOD.stones;
			c.spirits.visible = layers.spirits && d < LOD.spirits;
			c.fx.visible = layers.fx && d < LOD.fx;
			c.ambient.visible = layers.ambient && d < LOD.fx;
			c.attacks.visible = layers.attacks && d < LOD.fx;
			c.flags.visible = layers.flags && d < LOD.flags;
			c.fronts.visible = layers.fronts && d < LOD.fronts;
			c.trend.visible = layers.trend && d < LOD.spirits;
			c.border.visible = layers.border;
		}
	}

	dispose() {
		this.group.traverse((o) => {
			if (o instanceof THREE.InstancedMesh) o.dispose();
			else if (o instanceof THREE.Points) o.geometry.dispose();
		});
		this.group.clear();
		this.chunks = [];
	}
}

function flagGeometry() {
	return merge(
		baked(new THREE.CylinderGeometry(0.008, 0.01, 0.34, 4).translate(0, 0.17, 0), '#d4a73a'),
		baked(new THREE.BoxGeometry(0.14, 0.09, 0.008).translate(0.07, 0.28, 0), '#fff6df'),
		baked(new THREE.BoxGeometry(0.03, 0.03, 0.012).translate(0.07, 0.28, 0), '#d4a73a'),
	);
}

export const SPIRIT_UP = 0.3;

/** The border's width and height multiplier: grows as the camera pulls back, so it stays a line you can see. */
export const borderWidth = {value: 1};

function borderMaterial() {
	// a ribbon lying on the ground: each vertex carries the direction to widen in
	const m = new THREE.MeshBasicMaterial({color: '#ffd36a', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4});
	m.onBeforeCompile = (shader) => {
		shader.uniforms.uWidth = borderWidth;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nuniform float uWidth;\nattribute vec2 aSide;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xz += aSide * 0.028 * uWidth;');
	};
	return m;
}

/** The height of a cell's middle: the ground, or in B the top of its feature. */
export function centreOf(c: Cell, terrain: Terrain, variant: 'A' | 'B'): number {
	const h = terrain.heightAt(c.x, c.y);
	if (variant !== 'B') return h;
	if (c.color === 5) return h + 0.12 + 0.07 * c.life;
	if (c.color === 6) return h + (0.7 + 0.12 * c.life) * 0.22;
	if (c.color === 1 || c.color === 2) return h + 0.12;
	return h;
}

export type Once = {start: number; duration: number};

/** Motes rising where life comes, embers falling where it goes; looping, or once from `once.start`. */
export function pushLifeChange(terrain: Terrain, c: Cell, trend: 'grow' | 'shrink' | 'death', fx: FxBuilder, once?: Once) {
	const b = BIOMES[c.color];
	const n = trend === 'grow' ? 5 : trend === 'shrink' ? 6 : 12;
	for (let i = 0; i < n; i++) {
		const a = hash2(c.x, c.y, 60 + i) * 6.283,
			r = 0.1 + 0.25 * hash2(c.x, c.y, 70 + i);
		const px = c.x + Math.cos(a) * r,
			pz = c.y + Math.sin(a) * r;
		const at = {x: px, y: terrain.heightAt(px, pz), z: pz};
		const color = trend === 'grow' ? col('#fff3a0').clone().lerp(col(b.spirit), 0.4) : trend === 'shrink' ? col(i % 2 ? '#ff4a2a' : '#ff9a4a') : col(i % 2 ? '#5a5048' : '#8a7f72');
		const kind = trend === 'grow' ? 0 : trend === 'shrink' ? 1 : 3;
		const size = trend === 'death' ? 0.1 : trend === 'grow' ? 0.06 : 0.05;
		if (once) {
			const start = once.start + hash2(c.x, c.y, 80 + i) * once.duration * 0.4;
			fx.push(at, {x: 0, y: 0, z: 0}, color, start, 1 / (once.duration * (trend === 'death' ? 0.5 : 1)), kind + 10, size);
		} else fx.push(at, {x: 0, y: 0, z: 0}, color, hash2(c.x, c.y, 80 + i), trend === 'grow' ? 0.45 : 0.55, kind, size);
	}
}

/** Bolts from a living spirit to every enemy edge, and the spark where each lands. */
export function pushAttacks(board: Board, terrain: Terrain, variant: 'A' | 'B', c: Cell, fx: FxBuilder, once?: Once, toward?: {x: number; y: number}) {
	const b = BIOMES[c.color];
	const spiritY = centreOf(c, terrain, variant) + SPIRIT_UP;
	for (const [dx, dy] of [
		[0, -1],
		[1, 0],
		[0, 1],
		[-1, 0],
	]) {
		const n = board.get(key(c.x + dx, c.y + dy));
		if (!n || n.color === c.color) continue;
		if (toward && (n.x !== toward.x || n.y !== toward.y)) continue;
		const ex = c.x + dx * 0.5,
			ez = c.y + dy * 0.5;
		const ey = Math.max(terrain.heightAt(ex, ez), 0) + 0.08;
		const spark = col(b.spirit).clone().lerp(col('#ffffff'), 0.4);
		if (once) {
			const start = once.start + hash2(c.x * 4 + dx, c.y * 4 + dy, 1) * once.duration * 0.3;
			const d = once.duration * 0.7;
			for (let k = 0; k < 6; k++) fx.push({x: c.x, y: spiritY, z: c.y}, {x: ex, y: ey, z: ez}, k ? col(b.spirit) : spark, start + k * 0.035, 1 / d, 12, 0.2 * (1 - k * 0.13));
			fx.push({x: ex - dx * 0.04, y: ey, z: ez - dy * 0.04}, {x: 0, y: 0, z: 0}, spark, start + d, 1 / 0.6, 14, 0.7);
			fx.push({x: ex - dx * 0.04, y: ey, z: ez - dy * 0.04}, {x: 0, y: 0, z: 0}, col('#ff4a2a'), start + d, 1 / 0.9, 14, 1.1);
		} else {
			const ph = hash2(c.x * 4 + dx, c.y * 4 + dy, 0);
			for (let k = 0; k < 6; k++) fx.push({x: c.x, y: spiritY, z: c.y}, {x: ex, y: ey, z: ez}, k ? col(b.spirit) : spark, ph - k * 0.02, 0.5, 2, 0.16 * (1 - k * 0.13));
			fx.push({x: ex - dx * 0.04, y: ey, z: ez - dy * 0.04}, {x: 0, y: 0, z: 0}, spark, ph, 0.5, 4, 0.5);
		}
	}
}

function arrowGeometry() {
	return new THREE.ConeGeometry(0.06, 0.1, 4).translate(0, 0.05, 0);
}

/** A ribbon of quads, widened in the shader so it keeps a readable width at any zoom. */
class BorderBuilder {
	pos: number[] = [];
	side: number[] = [];
	idx: number[] = [];
	private quad(p: number[][], sides: number[][]) {
		const base = this.pos.length / 3;
		for (let i = 0; i < 4; i++) {
			this.pos.push(...p[i]);
			this.side.push(...sides[i]);
		}
		this.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
	}
	/** A line along the ground from a to b, sampled so it follows the terrain, a square cap at each end. */
	line(ax: number, az: number, bx: number, bz: number, height: (x: number, z: number) => number) {
		const len = Math.hypot(bx - ax, bz - az);
		const tx = (bx - ax) / len,
			tz = (bz - az) / len;
		const nx = -tz,
			nz = tx;
		const n = Math.max(1, Math.ceil(len / 0.12));
		let prev: number[] | undefined;
		for (let k = 0; k <= n; k++) {
			const x = ax + ((bx - ax) * k) / n,
				z = az + ((bz - az) * k) / n;
			const p = [x, height(x, z), z];
			if (prev) this.quad([prev, prev, p, p], [[nx, nz], [-nx, -nz], [nx, nz], [-nx, -nz]]);
			if (k === 0 || k === n) {
				const s = k === 0 ? -1 : 1;
				this.quad([p, p, p, p], [[nx, nz], [-nx, -nz], [nx + s * tx, nz + s * tz], [-nx + s * tx, -nz + s * tz]]);
			}
			prev = p;
		}
	}
	into(group: THREE.Group) {
		if (!this.pos.length) return;
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
		g.setAttribute('aSide', new THREE.Float32BufferAttribute(this.side, 2));
		g.setIndex(this.idx);
		g.computeBoundingSphere();
		if (g.boundingSphere) g.boundingSphere.radius += 0.3;
		const mesh = new THREE.Mesh(g, mats.border);
		mesh.renderOrder = 2;
		group.add(mesh);
	}
}

/**
 * Your territory's border: a gold line just inside every edge of your cells
 * that does not touch another of yours, lying on the ground (never below the
 * sea), continuing into the next cell where the territory goes on.
 */
function addBorder(board: Board, terrain: Terrain, c: Cell, out: BorderBuilder) {
	const IN = 0.4;
	const mine = (x: number, y: number) => board.get(key(x, y))?.owner === ME;
	const height = (x: number, z: number) => Math.max(terrain.heightAt(x, z), 0.04) + 0.03;
	for (const [dx, dy] of [
		[0, -1],
		[1, 0],
		[0, 1],
		[-1, 0],
	]) {
		if (mine(c.x + dx, c.y + dy)) continue;
		const tx = -dy,
			ty = dx;
		const ext = (s: number) => {
			const nx = c.x + s * tx,
				ny = c.y + s * ty;
			if (!mine(nx, ny)) return IN;
			return mine(nx + dx, ny + dy) ? 1 - IN : 0.5;
		};
		const a = -ext(-1),
			b = ext(1);
		out.line(c.x + dx * IN + tx * a, c.y + dy * IN + ty * a, c.x + dx * IN + tx * b, c.y + dy * IN + ty * b, height);
	}
}

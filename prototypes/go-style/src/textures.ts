/**
 * THROWAWAY PROTOTYPE. Every texture is drawn once in code (Canvas 2D) and
 * reused as a pixi sprite: no art assets.
 */
import {Texture} from 'pixi.js';
import {Blockie} from './blockie';
import {bakeFaces} from './bake';

export type Look = 'flat' | 'rich' | 'baked' | 'three';

export const COLOURS = ['#00000000', '#5ab9bb', '#c5836e', '#8bffcb', '#d3d66d', '#a9799d', '#3d3d3d'];

/**
 * The legacy hues as jewels: the same hue, more saturated and deeper, so a gem
 * reads as a sapphire, a garnet, an emerald, a topaz, an amethyst. Used by every
 * look but the flat one (bridges included, so a group stays one colour).
 */
export function jewel(color: number): string {
	if (color === 6) return '#2a2a2a';
	const n = parseInt(COLOURS[color].slice(1, 7), 16);
	let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	let h = 0;
	const l = (max + min) / 2;
	const d = max - min;
	let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	h = (h * 60 + 360) % 360;
	s = Math.min(1, s * 1.35 + 0.15);
	const L = Math.min(0.5, l * 0.68);
	const c = (1 - Math.abs(2 * L - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = L - c / 2;
	[r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
	const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
	return '#' + to(r) + to(g) + to(b);
}

/** Texture size and stone radius in texture pixels. */
export const T = 224;
export const RT = 64;
const C = T / 2;

const cache = new Map<string, Texture>();
function cached(id: string, draw: (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => void, size = T): Texture {
	let t = cache.get(id);
	if (!t) {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		const ctx = canvas.getContext('2d')!;
		draw(ctx, canvas);
		t = Texture.from(canvas);
		cache.set(id, t);
	}
	return t;
}

function rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1, 7), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, amount: number): string {
	const [r, g, b] = rgb(hex);
	const f = (v: number) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
	return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export const MARK_RADIUS = 0.74; // of the stone radius
export function markAngle(i: number): number {
	return -Math.PI / 2 + (i * 2 * Math.PI) / 7;
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, filled: boolean, light = false) {
	ctx.beginPath();
	if (filled) {
		// ink pips: dark on every faction colour, light or not; bone on Evil's charcoal
		ctx.arc(x, y, RT * 0.115, 0, Math.PI * 2);
		ctx.fillStyle = light ? '#efe6d2' : '#1d130a';
		ctx.fill();
		ctx.lineWidth = 1.8;
		ctx.strokeStyle = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
		ctx.stroke();
	} else {
		ctx.arc(x, y, RT * 0.075, 0, Math.PI * 2);
		ctx.lineWidth = 2;
		ctx.strokeStyle = light ? 'rgba(255,255,255,0.3)' : 'rgba(20,10,0,0.35)';
		ctx.stroke();
	}
}

let baked: Map<number, HTMLCanvasElement> | undefined;
function bakedFace(color: number): HTMLCanvasElement {
	baked ??= bakeFaces(
		COLOURS.map((_, id) => ({id, hex: jewel(id)})).filter((c) => c.id > 0),
		Math.round(RT * 2.2 * 2),
	);
	return baked.get(color)!;
}

/** A gem: its face (by look), the stack of gems under it (one per gem at stake) and its shadow. */
export function stoneTexture(color: number, opts: {marks?: number; stake?: number; look?: Look} = {}): Texture {
	const stake = Math.min(opts.stake ?? 1, 4);
	const look = opts.look ?? 'flat';
	return cached(`stone:${look}:${color}:${opts.marks ?? '-'}:${stake}`, (ctx) => {
		const hex = look === 'flat' ? COLOURS[color] : jewel(color);
		const evil = color === 6;
		const step = 9;
		const thick = 3 + step * (stake - 1);
		// shadow
		ctx.save();
		ctx.filter = 'blur(4px)';
		ctx.beginPath();
		ctx.ellipse(C + 2, C + thick + 5, RT * 0.98, RT * 0.9, 0, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(40,20,0,0.38)';
		ctx.fill();
		ctx.restore();
		// the stack: one disc per extra gem, from the bottom up
		for (let g = stake - 1; g >= 1; g--) {
			const y = C + 3 + step * g;
			ctx.beginPath();
			ctx.arc(C, y, RT, 0, Math.PI * 2);
			ctx.fillStyle = evil ? '#1b1b1b' : shade(hex, -0.5);
			ctx.fill();
			ctx.beginPath();
			ctx.arc(C, y - 3, RT, 0.08 * Math.PI, 0.92 * Math.PI);
			ctx.lineWidth = 2.5;
			ctx.strokeStyle = evil ? 'rgba(220,210,190,0.55)' : 'rgba(255,255,255,0.55)';
			ctx.stroke();
		}
		// the gem's own side
		ctx.beginPath();
		ctx.arc(C, C + 3, RT, 0, Math.PI * 2);
		ctx.fillStyle = evil ? '#1e1e1e' : shade(hex, -0.45);
		ctx.fill();
		if (look === 'baked') {
			const r = RT * 1.1;
			ctx.drawImage(bakedFace(color), C - r, C - r, r * 2, r * 2);
		} else if (look === 'rich') {
			richFace(ctx, hex, evil);
		} else {
			flatFace(ctx, hex, evil);
		}
		if (opts.marks !== undefined) {
			for (let i = 0; i < 7; i++) {
				const a = markAngle(i);
				drawMark(ctx, C + Math.cos(a) * RT * MARK_RADIUS, C + Math.sin(a) * RT * MARK_RADIUS, i < opts.marks, evil);
			}
		}
	});
}

function flatFace(ctx: CanvasRenderingContext2D, hex: string, evil: boolean) {
	ctx.beginPath();
	ctx.arc(C, C, RT, 0, Math.PI * 2);
	if (evil) {
		ctx.fillStyle = '#3a3a3a';
	} else {
		const g = ctx.createRadialGradient(C - RT * 0.35, C - RT * 0.45, RT * 0.05, C, C, RT);
		g.addColorStop(0, shade(hex, 0.55));
		g.addColorStop(0.45, hex);
		g.addColorStop(1, shade(hex, -0.28));
		ctx.fillStyle = g;
	}
	ctx.fill();
	ctx.lineWidth = 2;
	ctx.strokeStyle = evil ? '#151515' : shade(hex, -0.55);
	ctx.stroke();
	if (evil) {
		ctx.beginPath();
		ctx.arc(C, C, RT * 0.55, 0, Math.PI * 2);
		ctx.lineWidth = 3;
		ctx.strokeStyle = '#2b2b2b';
		ctx.stroke();
	}
}

/** A cabochon drawn in 2D: deep rim, inner caustic, a flat table, two highlights. */
function richFace(ctx: CanvasRenderingContext2D, hex: string, evil: boolean) {
	const body = evil ? '#3b3b3b' : hex;
	ctx.beginPath();
	ctx.arc(C, C, RT, 0, Math.PI * 2);
	const g = ctx.createRadialGradient(C + RT * 0.22, C + RT * 0.28, RT * 0.02, C, C, RT);
	g.addColorStop(0, shade(body, evil ? 0.12 : 0.45));
	g.addColorStop(0.55, body);
	g.addColorStop(0.88, shade(body, -0.45));
	g.addColorStop(1, shade(body, -0.7));
	ctx.fillStyle = g;
	ctx.fill();
	// the table: a flat facet on top, the ring the Evil stone had
	ctx.beginPath();
	ctx.arc(C, C, RT * 0.52, 0, Math.PI * 2);
	ctx.fillStyle = evil ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)';
	ctx.fill();
	ctx.lineWidth = 2.2;
	ctx.strokeStyle = evil ? 'rgba(0,0,0,0.55)' : shade(body, -0.35);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(C, C, RT * 0.52 + 2, -Math.PI * 0.95, -Math.PI * 0.35);
	ctx.lineWidth = 1.5;
	ctx.strokeStyle = 'rgba(255,255,255,0.55)';
	ctx.stroke();
	// highlights
	ctx.save();
	ctx.translate(C - RT * 0.4, C - RT * 0.45);
	ctx.rotate(-0.7);
	const h = ctx.createRadialGradient(0, 0, 0, 0, 0, RT * 0.32);
	h.addColorStop(0, 'rgba(255,255,255,0.95)');
	h.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.scale(1, 0.5);
	ctx.beginPath();
	ctx.arc(0, 0, RT * 0.32, 0, Math.PI * 2);
	ctx.fillStyle = h;
	ctx.fill();
	ctx.restore();
	ctx.beginPath();
	ctx.arc(C + RT * 0.5, C + RT * 0.48, RT * 0.07, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(255,255,255,0.4)';
	ctx.fill();
	// rim and bevel
	ctx.beginPath();
	ctx.arc(C, C, RT, 0, Math.PI * 2);
	ctx.lineWidth = 2;
	ctx.strokeStyle = shade(body, -0.75);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(C, C, RT * 0.93, Math.PI * 0.1, Math.PI * 0.9);
	ctx.lineWidth = 1.5;
	ctx.strokeStyle = 'rgba(255,255,255,0.22)';
	ctx.stroke();
}

/** The player's own gems sit in a gold bezel: visible at every zoom, and it says "yours". */
export function bezelTexture(): Texture {
	return cached('bezel', (ctx) => {
		const g = ctx.createLinearGradient(C - RT, C - RT, C + RT, C + RT);
		g.addColorStop(0, '#fff2b0');
		g.addColorStop(0.35, '#e0b445');
		g.addColorStop(0.7, '#9a6b1c');
		g.addColorStop(1, '#f2cf6a');
		ctx.beginPath();
		ctx.arc(C, C, RT * 1.06, 0, Math.PI * 2);
		ctx.lineWidth = RT * 0.2;
		ctx.strokeStyle = g;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(C, C, RT * 1.17, 0, Math.PI * 2);
		ctx.lineWidth = 2;
		ctx.strokeStyle = 'rgba(60,35,0,0.8)';
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(C, C, RT * 0.95, 0, Math.PI * 2);
		ctx.stroke();
		// four prongs
		for (let i = 0; i < 4; i++) {
			const a = Math.PI / 4 + (i * Math.PI) / 2;
			ctx.beginPath();
			ctx.arc(C + Math.cos(a) * RT * 1.0, C + Math.sin(a) * RT * 1.0, RT * 0.12, 0, Math.PI * 2);
			ctx.fillStyle = g;
			ctx.fill();
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
	});
}

/** The pending mark: gold where life is coming, red where it is going. */
export function pendingTexture(kind: 'grow' | 'shrink'): Texture {
	return cached(
		`pending:${kind}`,
		(ctx) => {
			const c = 24;
			const glow = ctx.createRadialGradient(c, c, 0, c, c, 22);
			glow.addColorStop(0, kind === 'grow' ? 'rgba(255,240,170,0.95)' : 'rgba(255,60,50,0.95)');
			glow.addColorStop(1, 'rgba(255,255,255,0)');
			ctx.fillStyle = glow;
			ctx.fillRect(0, 0, 48, 48);
			ctx.beginPath();
			ctx.arc(c, c, RT * 0.12, 0, Math.PI * 2);
			ctx.fillStyle = kind === 'grow' ? '#fff3b8' : '#e3241b';
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = kind === 'grow' ? '#6b4a00' : '#4a0000';
			ctx.stroke();
		},
		48,
	);
}

/** A periodic wood grain (the tile repeats seamlessly), straight-grained like a goban. */
export function woodCanvas(size = 1024): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const img = ctx.createImageData(size, size);
	const lattice = (n: number, seed: number) => {
		const t = new Float32Array(n * n);
		let s = seed;
		for (let i = 0; i < t.length; i++) t[i] = (s = (s * 16807) % 2147483647) / 2147483647;
		return (x: number, y: number) => {
			const xi = Math.floor(x), yi = Math.floor(y);
			const fx = x - xi, fy = y - yi;
			const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
			const at = (i: number, j: number) => t[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
			const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
			return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
		};
	};
	const n1 = lattice(8, 11), n2 = lattice(32, 23), n3 = lattice(64, 37);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const u = (x / size), v = (y / size);
			// straight grain (masame): fine, nearly parallel lines with a slow drift
			const warp = n1(u * 8, v * 8) * 0.9 + n2(u * 32, v * 32) * 0.12;
			const rings = Math.sin((u * 96 + warp) * Math.PI * 2);
			const grain = Math.pow(0.5 + 0.5 * rings, 10);
			const fleck = n3(u * 64, v * 64);
			const k = 0.22 * grain + 0.07 * fleck + 0.1 * n1(u * 8 + 3, v * 8 + 5);
			const i = (y * size + x) * 4;
			img.data[i] = 226 - 70 * k;
			img.data[i + 1] = 186 - 66 * k;
			img.data[i + 2] = 124 - 52 * k;
			img.data[i + 3] = 255;
		}
	ctx.putImageData(img, 0, 0);
	return canvas;
}

/** One filled mark, for the pulse and the turn's animation. */
export function markTexture(light = false): Texture {
	return cached(
		`mark:${light}`,
		(ctx) => {
			drawMark(ctx, 16, 16, true, light);
		},
		32,
	);
}

/**
 * A dead cell: it stays on the board, keeps its colour and still counts for
 * its neighbours, but holds nothing and is free to anyone. A flat, sunken
 * husk of its colour, cracked through, with no shine and no thickness.
 */
export function huskTexture(color: number): Texture {
	return cached(`husk:${color}`, (ctx) => {
		const hex = COLOURS[color];
		const [r, g, b] = rgb(hex);
		const grey = (v: number) => Math.round(v * 0.45 + 120 * 0.55);
		ctx.beginPath();
		ctx.arc(C, C, RT * 0.92, 0, Math.PI * 2);
		ctx.fillStyle = `rgba(${grey(r)},${grey(g)},${grey(b)},0.85)`;
		ctx.fill();
		// sunken: a dark inner shadow at the top
		const s = ctx.createLinearGradient(0, C - RT, 0, C + RT);
		s.addColorStop(0, 'rgba(30,15,0,0.45)');
		s.addColorStop(0.4, 'rgba(30,15,0,0)');
		ctx.fillStyle = s;
		ctx.fill();
		ctx.setLineDash([6, 5]);
		ctx.lineWidth = 3;
		ctx.strokeStyle = shade(hex, -0.5);
		ctx.stroke();
		ctx.setLineDash([]);
	});
}

/** Cracks, `n` of 6, deterministic, on a transparent texture. */
export function crackTexture(n: number): Texture {
	return cached(`cracks:${n}`, (ctx) => {
		let seed = 7;
		const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
		for (let i = 0; i < n; i++) {
			const a0 = 0.5 + (i * 2 * Math.PI) / 6 + (rand() - 0.5) * 0.5;
			const len = RT * (0.5 + 0.35 * rand());
			const pts: [number, number][] = [];
			let r = RT * 0.98;
			let a = a0;
			while (r > RT - len) {
				pts.push([C + Math.cos(a) * r, C + Math.sin(a) * r]);
				r -= RT * (0.1 + 0.08 * rand());
				a += (rand() - 0.5) * 0.35;
			}
			for (const [style, w, off] of [
				['rgba(255,255,255,0.45)', 2, 1.2],
				['rgba(25,12,0,0.85)', 2.6, 0],
			] as const) {
				ctx.beginPath();
				pts.forEach(([x, y], j) => (j ? ctx.lineTo(x + off, y + off) : ctx.moveTo(x + off, y + off)));
				ctx.lineWidth = w;
				ctx.strokeStyle = style;
				ctx.lineJoin = 'round';
				ctx.stroke();
			}
		}
	});
}

/** The soft light ring of a growing stone. */
export function glowTexture(): Texture {
	return cached('glow', (ctx) => {
		const g = ctx.createRadialGradient(C, C, RT * 0.9, C, C, RT * 1.36);
		g.addColorStop(0, 'rgba(255,246,200,0)');
		g.addColorStop(0.3, 'rgba(255,246,200,0.95)');
		g.addColorStop(1, 'rgba(255,246,200,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, T, T);
	});
}

/** The red-tinted rim of a shrinking stone. */
export function rimTexture(): Texture {
	return cached('rim', (ctx) => {
		ctx.beginPath();
		ctx.arc(C, C, RT * 0.93, 0, Math.PI * 2);
		ctx.lineWidth = RT * 0.13;
		ctx.strokeStyle = 'rgba(205,30,30,0.85)';
		ctx.stroke();
		const g = ctx.createRadialGradient(C, C, RT * 0.95, C, C, RT * 1.25);
		g.addColorStop(0, 'rgba(200,20,20,0.45)');
		g.addColorStop(1, 'rgba(200,20,20,0)');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc(C, C, RT * 1.25, 0, Math.PI * 2);
		ctx.arc(C, C, RT * 0.99, 0, Math.PI * 2, true);
		ctx.fill();
	});
}

/** A thin ring, for the next size (variant b) and the owner highlight. */
export function ringTexture(kind: 'next' | 'halo'): Texture {
	return cached(`ring:${kind}`, (ctx) => {
		ctx.beginPath();
		if (kind === 'next') {
			ctx.setLineDash([7, 6]);
			ctx.arc(C, C, RT * 0.98, 0, Math.PI * 2);
			ctx.lineWidth = 2.4;
			ctx.strokeStyle = 'rgba(255,250,225,0.95)';
		} else {
			ctx.arc(C, C, RT * 1.14, 0, Math.PI * 2);
			ctx.lineWidth = 6;
			ctx.strokeStyle = 'rgba(255,255,255,0.95)';
		}
		ctx.stroke();
	});
}

/** A planned removal. */
export function crossTexture(): Texture {
	return cached('cross', (ctx) => {
		for (const [w, s] of [
			[13, 'rgba(255,255,255,0.9)'],
			[7, '#a3141a'],
		] as const) {
			ctx.beginPath();
			const d = RT * 0.55;
			ctx.moveTo(C - d, C - d);
			ctx.lineTo(C + d, C + d);
			ctx.moveTo(C + d, C - d);
			ctx.lineTo(C - d, C + d);
			ctx.lineWidth = w;
			ctx.lineCap = 'round';
			ctx.strokeStyle = s;
			ctx.stroke();
		}
	});
}

export function blockieDataURL(address: string, px = 48): string {
	const tmp = document.createElement('canvas');
	tmp.width = tmp.height = 8;
	Blockie.get(address).draw(tmp.getContext('2d')!, 0, 0, 1);
	const out = document.createElement('canvas');
	out.width = out.height = px;
	const ctx = out.getContext('2d')!;
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(tmp, 0, 0, px, px);
	return out.toDataURL();
}

export function blockieColour(address: string): string {
	const {h, s, l} = Blockie.get(address).color;
	return `hsl(${h * 360},${Math.max(s, 0.6) * 100}%,${Math.min(Math.max(l, 0.35), 0.55) * 100}%)`;
}

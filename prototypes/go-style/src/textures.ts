/**
 * THROWAWAY PROTOTYPE. Every texture is drawn once in code (Canvas 2D) and
 * reused as a pixi sprite: no art assets.
 */
import {Texture} from 'pixi.js';
import {Blockie} from './blockie';

export const COLOURS = ['#00000000', '#5ab9bb', '#c5836e', '#8bffcb', '#d3d66d', '#a9799d', '#3d3d3d'];

/** Texture size and stone radius in texture pixels. */
export const T = 176;
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

/** A stone: face, rim and the side that shows its thickness (one per gem). */
export function stoneTexture(color: number, opts: {marks?: number; stake?: number} = {}): Texture {
	const stake = Math.min(opts.stake ?? 1, 4);
	return cached(`stone:${color}:${opts.marks ?? '-'}:${stake}`, (ctx) => {
		const hex = COLOURS[color];
		const evil = color === 6;
		const thick = 3 + 7 * (stake - 1);
		// shadow
		ctx.save();
		ctx.filter = 'blur(4px)';
		ctx.beginPath();
		ctx.ellipse(C + 2, C + thick + 5, RT * 0.98, RT * 0.9, 0, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(40,20,0,0.35)';
		ctx.fill();
		ctx.restore();
		// side (thickness)
		ctx.beginPath();
		ctx.arc(C, C + thick, RT, 0, Math.PI * 2);
		ctx.fillStyle = evil ? '#1e1e1e' : shade(hex, -0.45);
		ctx.fill();
		for (let g = 1; g < stake; g++) {
			// one seam per extra gem: a stack of stones
			ctx.beginPath();
			ctx.arc(C, C + 7 * g, RT, 0.15 * Math.PI, 0.85 * Math.PI);
			ctx.lineWidth = 1.6;
			ctx.strokeStyle = 'rgba(255,255,255,0.5)';
			ctx.stroke();
		}
		// face
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
		if (opts.marks !== undefined) {
			for (let i = 0; i < 7; i++) {
				const a = markAngle(i);
				drawMark(ctx, C + Math.cos(a) * RT * MARK_RADIUS, C + Math.sin(a) * RT * MARK_RADIUS, i < opts.marks, evil);
			}
		}
	});
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

/** The player's own stone: a centre dot, as Go marks the last move. */
export function dotTexture(): Texture {
	return cached('dot', (ctx) => {
		ctx.beginPath();
		ctx.arc(C, C, RT * 0.17, 0, Math.PI * 2);
		ctx.fillStyle = '#ffffff';
		ctx.fill();
		ctx.lineWidth = 4;
		ctx.strokeStyle = '#161616';
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

/** An owner's blockie as a round inlay for the stone's centre. */
export function inlayTexture(address: string, mine: boolean): Texture {
	return cached(`inlay:${address}:${mine}`, (ctx) => {
		const r = RT * 0.46;
		const tmp = document.createElement('canvas');
		tmp.width = tmp.height = 8;
		Blockie.get(address).draw(tmp.getContext('2d')!, 0, 0, 1);
		ctx.save();
		ctx.beginPath();
		ctx.arc(C, C, r, 0, Math.PI * 2);
		ctx.clip();
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(tmp, C - r, C - r, r * 2, r * 2);
		ctx.restore();
		ctx.beginPath();
		ctx.arc(C, C, r, 0, Math.PI * 2);
		ctx.lineWidth = mine ? 6 : 3;
		ctx.strokeStyle = mine ? '#ffffff' : 'rgba(20,10,0,0.7)';
		ctx.stroke();
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

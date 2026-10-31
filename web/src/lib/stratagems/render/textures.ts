/**
 * Every texture the board draws, made once in code (Canvas 2D) and reused: no
 * art assets and no sprite bundle (step 9, P9-4). Browser only.
 *
 * The chosen look of the prototype `proto/go-style` (rounds 1 to 7): jewel
 * cabochons with a table ring on straight-grained kaya wood, ink pips round the
 * rim (bone on Evil's charcoal), a husk for a dead cell, a gold bezel with four
 * prongs for yours, a narrow light ring on a growing gem and a red rim on a
 * shrinking one.
 *
 * Smooth art: every texture is filtered linearly, overriding the pixi host's
 * `nearest` default (`$lib/game/render/pixi/assets.ts`), which is for pixel art.
 * NO FILTERS anywhere (P9-7): pixi's Canvas renderer, the fallback when WebGL
 * cannot start, skips them, so softness is baked into the textures here.
 */
import {Texture} from 'pixi.js';
import {gemColour, markAngle} from './look';
import {COLOURS} from '../faction';

/** Texture size and stone radius, in texture pixels. */
export const T = 224;
export const RT = 64;
/** The marks' distance from the centre, as a fraction of the stone's radius. */
export const MARK_RADIUS = 0.74;
const C = T / 2;
const EVIL = 6;

const cache = new Map<string, Texture>();

function cached(
	id: string,
	draw: (ctx: CanvasRenderingContext2D) => void,
	size = T,
): Texture {
	let texture = cache.get(id);
	if (!texture) {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = size;
		draw(canvas.getContext('2d')!);
		texture = Texture.from(canvas);
		texture.source.scaleMode = 'linear';
		cache.set(id, texture);
	}
	return texture;
}

function rgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1, 7), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, amount: number): string {
	const [r, g, b] = rgb(hex);
	const f = (v: number) =>
		Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
	return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function pip(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	filled: boolean,
	bone: boolean,
) {
	ctx.beginPath();
	if (filled) {
		ctx.arc(x, y, RT * 0.115, 0, Math.PI * 2);
		ctx.fillStyle = bone ? '#efe6d2' : '#1d130a';
		ctx.fill();
		ctx.lineWidth = 1.8;
		ctx.strokeStyle = bone ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
	} else {
		ctx.arc(x, y, RT * 0.075, 0, Math.PI * 2);
		ctx.lineWidth = 2;
		ctx.strokeStyle = bone ? 'rgba(255,255,255,0.3)' : 'rgba(20,10,0,0.35)';
	}
	ctx.stroke();
}

/** A cabochon: deep rim, inner caustic, a flat table, two highlights. */
function face(ctx: CanvasRenderingContext2D, hex: string, evil: boolean) {
	const body = evil ? '#3b3b3b' : hex;
	ctx.beginPath();
	ctx.arc(C, C, RT, 0, Math.PI * 2);
	const g = ctx.createRadialGradient(
		C + RT * 0.22,
		C + RT * 0.28,
		RT * 0.02,
		C,
		C,
		RT,
	);
	g.addColorStop(0, shade(body, evil ? 0.12 : 0.45));
	g.addColorStop(0.55, body);
	g.addColorStop(0.88, shade(body, -0.45));
	g.addColorStop(1, shade(body, -0.7));
	ctx.fillStyle = g;
	ctx.fill();
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

/**
 * A gem: its shadow, the stack under it (one disc per extra gem at stake, which
 * only Evil has), its side and its face, and the dial when `marks` is given
 * (that many of `maxLife` filled).
 */
export function stoneTexture(
	color: number,
	opts: {marks?: number; maxLife: number; stake: number},
): Texture {
	const stake = Math.max(1, Math.min(opts.stake, 4));
	return cached(
		`stone:${color}:${opts.marks ?? '-'}:${opts.maxLife}:${stake}`,
		(ctx) => {
			const hex = gemColour(color);
			const evil = color === EVIL;
			const step = 9;
			const thick = 3 + step * (stake - 1);
			ctx.save();
			ctx.filter = 'blur(4px)';
			ctx.beginPath();
			ctx.ellipse(C + 2, C + thick + 5, RT * 0.98, RT * 0.9, 0, 0, Math.PI * 2);
			ctx.fillStyle = 'rgba(40,20,0,0.38)';
			ctx.fill();
			ctx.restore();
			for (let g = stake - 1; g >= 1; g--) {
				const y = C + 3 + step * g;
				ctx.beginPath();
				ctx.arc(C, y, RT, 0, Math.PI * 2);
				ctx.fillStyle = evil ? '#1b1b1b' : shade(hex, -0.5);
				ctx.fill();
				ctx.beginPath();
				ctx.arc(C, y - 3, RT, 0.08 * Math.PI, 0.92 * Math.PI);
				ctx.lineWidth = 2.5;
				ctx.strokeStyle = evil
					? 'rgba(220,210,190,0.55)'
					: 'rgba(255,255,255,0.55)';
				ctx.stroke();
			}
			ctx.beginPath();
			ctx.arc(C, C + 3, RT, 0, Math.PI * 2);
			ctx.fillStyle = evil ? '#1e1e1e' : shade(hex, -0.45);
			ctx.fill();
			face(ctx, hex, evil);
			if (opts.marks !== undefined) {
				for (let i = 0; i < opts.maxLife; i++) {
					const a = markAngle(i, opts.maxLife);
					pip(
						ctx,
						C + Math.cos(a) * RT * MARK_RADIUS,
						C + Math.sin(a) * RT * MARK_RADIUS,
						i < opts.marks,
						evil,
					);
				}
			}
		},
	);
}

/**
 * A dead cell: flat, sunken, greyed toward the wood, cracked through. It stays
 * on the board, keeps its colour and still counts for its neighbours.
 */
export function huskTexture(color: number): Texture {
	return cached(`husk:${color}`, (ctx) => {
		const hex = COLOURS[color]?.hex ?? '#808080';
		const [r, g, b] = rgb(hex);
		const grey = (v: number) => Math.round(v * 0.45 + 120 * 0.55);
		ctx.beginPath();
		ctx.arc(C, C, RT * 0.92, 0, Math.PI * 2);
		ctx.fillStyle = `rgba(${grey(r)},${grey(g)},${grey(b)},0.85)`;
		ctx.fill();
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
		let seed = 7;
		const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		for (let i = 0; i < 6; i++) {
			const a0 = 0.5 + (i * 2 * Math.PI) / 6 + (rand() - 0.5) * 0.5;
			const len = RT * (0.5 + 0.35 * rand());
			const points: [number, number][] = [];
			let radius = RT * 0.9;
			let a = a0;
			while (radius > RT - len) {
				points.push([C + Math.cos(a) * radius, C + Math.sin(a) * radius]);
				radius -= RT * (0.1 + 0.08 * rand());
				a += (rand() - 0.5) * 0.35;
			}
			ctx.beginPath();
			points.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
			ctx.lineWidth = 2.4;
			ctx.strokeStyle = 'rgba(25,12,0,0.5)';
			ctx.lineJoin = 'round';
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
			glow.addColorStop(
				0,
				kind === 'grow' ? 'rgba(255,240,170,0.95)' : 'rgba(255,60,50,0.95)',
			);
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

/** The narrow, steady light ring of a growing gem. */
export function glowTexture(): Texture {
	return cached('glow', (ctx) => {
		const g = ctx.createRadialGradient(C, C, RT * 0.96, C, C, RT * 1.16);
		g.addColorStop(0, 'rgba(255,240,180,0)');
		g.addColorStop(0.3, 'rgba(255,240,180,0.5)');
		g.addColorStop(1, 'rgba(255,240,180,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, T, T);
	});
}

/** The red rim of a shrinking gem. */
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

/** Yours: a gold bezel with four prongs, outlined so it holds on wood. */
export function bezelTexture(): Texture {
	return cached('bezel', (ctx) => {
		const gold = ctx.createLinearGradient(C - RT, C - RT, C + RT, C + RT);
		gold.addColorStop(0, '#fff3b8');
		gold.addColorStop(0.3, '#e6bb4c');
		gold.addColorStop(0.65, '#8f6216');
		gold.addColorStop(1, '#f0cd68');
		const edge = '#120a00';
		ctx.beginPath();
		ctx.arc(C, C, RT * 1.12, 0, Math.PI * 2);
		ctx.lineWidth = RT * 0.34;
		ctx.strokeStyle = edge;
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(C, C, RT * 1.12, 0, Math.PI * 2);
		ctx.lineWidth = RT * 0.24;
		ctx.strokeStyle = gold;
		ctx.stroke();
		for (let i = 0; i < 4; i++) {
			const a = Math.PI / 4 + (i * Math.PI) / 2;
			ctx.beginPath();
			ctx.arc(
				C + Math.cos(a) * RT * 1.04,
				C + Math.sin(a) * RT * 1.04,
				RT * 0.17,
				0,
				Math.PI * 2,
			);
			ctx.fillStyle = gold;
			ctx.fill();
			ctx.lineWidth = 2;
			ctx.strokeStyle = edge;
			ctx.stroke();
		}
	});
}

/** The focused owner's gems: a fine ring hugging the rim. */
export function focusRingTexture(): Texture {
	return cached('focus', (ctx) => {
		ctx.beginPath();
		ctx.arc(C, C, RT * 1.04, 0, Math.PI * 2);
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = 'rgba(255,255,255,0.9)';
		ctx.stroke();
	});
}

/** A planned placement's dashed ring, in the faction's colour. */
export function ghostRingTexture(color: number): Texture {
	return cached(`ghost:${color}`, (ctx) => {
		ctx.beginPath();
		ctx.setLineDash([7, 6]);
		ctx.arc(C, C, RT * 0.98, 0, Math.PI * 2);
		ctx.lineWidth = 3.5;
		ctx.strokeStyle = gemColour(color);
		ctx.stroke();
		ctx.setLineDash([]);
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

/**
 * A soft square blob, opaque in the middle and fading at the edge, for the
 * washes: laid one per cell, neighbours merge into one soft region without a
 * blur filter (P9-7). White, tinted by the sprite.
 */
export function washTexture(): Texture {
	return cached(
		'wash',
		(ctx) => {
			// a distance field rather than `ctx.filter`, which not every browser's
			// Canvas 2D has: alpha 1 inside a rounded square, falling smoothly to 0
			const size = 128;
			const half = size / 2;
			const box = size * 0.26;
			const corner = size * 0.14;
			const fade = size * 0.2;
			const img = ctx.createImageData(size, size);
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					const qx = Math.abs(x + 0.5 - half) - (box - corner);
					const qy = Math.abs(y + 0.5 - half) - (box - corner);
					const outside =
						Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
						Math.min(Math.max(qx, qy), 0) -
						corner;
					const t = Math.min(1, Math.max(0, outside / fade));
					const alpha = 1 - t * t * (3 - 2 * t);
					const i = (y * size + x) * 4;
					img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
					img.data[i + 3] = Math.round(alpha * 255);
				}
			}
			ctx.putImageData(img, 0, 0);
		},
		128,
	);
}

/**
 * The kaya board: straight grain (masame), seamless, warm. One tile spans
 * `WOOD_TILE_CELLS` intersections.
 */
export const WOOD_TILE_CELLS = 16;
export function woodTexture(): Texture {
	const size = 512;
	return cached(
		'wood',
		(ctx) => {
			const img = ctx.createImageData(size, size);
			const lattice = (n: number, seed: number) => {
				const t = new Float32Array(n * n);
				let s = seed;
				for (let i = 0; i < t.length; i++) {
					t[i] = (s = (s * 16807) % 2147483647) / 2147483647;
				}
				return (x: number, y: number) => {
					const xi = Math.floor(x);
					const yi = Math.floor(y);
					const fx = x - xi;
					const fy = y - yi;
					const sx = fx * fx * (3 - 2 * fx);
					const sy = fy * fy * (3 - 2 * fy);
					const at = (i: number, j: number) =>
						t[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
					const a = at(xi, yi);
					const b = at(xi + 1, yi);
					const c = at(xi, yi + 1);
					const d = at(xi + 1, yi + 1);
					return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
				};
			};
			const n1 = lattice(8, 11);
			const n2 = lattice(32, 23);
			const n3 = lattice(64, 37);
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					const u = x / size;
					const v = y / size;
					const warp = n1(u * 8, v * 8) * 0.9 + n2(u * 32, v * 32) * 0.12;
					const grain = Math.pow(
						0.5 + 0.5 * Math.sin((u * 48 + warp) * Math.PI * 2),
						10,
					);
					const k =
						0.22 * grain +
						0.07 * n3(u * 64, v * 64) +
						0.1 * n1(u * 8 + 3, v * 8 + 5);
					const i = (y * size + x) * 4;
					img.data[i] = 226 - 70 * k;
					img.data[i + 1] = 186 - 66 * k;
					img.data[i + 2] = 124 - 52 * k;
					img.data[i + 3] = 255;
				}
			}
			ctx.putImageData(img, 0, 0);
		},
		size,
	);
}

/** The ink of the lines and the hoshi on kaya. */
export const LINE_INK = {color: 0x24130a, alpha: 0.8};
/** The ivory wash under your gems. */
export const IVORY = 0xfffbef;

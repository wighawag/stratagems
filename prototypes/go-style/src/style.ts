/**
 * THROWAWAY PROTOTYPE, round 3. What a gem is made of, what the board is made
 * of, and how "yours" is marked: each a switch, so they can be mixed.
 *
 * - Gem styles: `jewel` (round 2's cabochon), `yunzi` (the satin, softly
 *   translucent stone of Go's yunzi stones: plain, warm, made to sit on wood),
 *   `lacquer` (deep urushi lacquer with a fine gold rim and inlaid gold pips:
 *   luxurious, still plain).
 * - Boards: `kaya` (straight-grained wood), `slate`, `washi` (paper), `felt`.
 * - Yours: `bezel` (gold, heavier, outlined), `halo` (an ivory ring with a dark
 *   edge, on the board around the gem), `tile` (the gem sits on a light plinth).
 */
export type GemStyle = 'jewel' | 'yunzi' | 'lacquer';
export type BoardKind = 'kaya' | 'slate' | 'washi' | 'felt';
export type MineMark = 'bezel' | 'halo' | 'tile';

export const LEGACY = ['#00000000', '#5ab9bb', '#c5836e', '#8bffcb', '#d3d66d', '#a9799d', '#3d3d3d'];

export function hexToHsl(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1, 7), 16);
	const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	let h = 0;
	if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [(h * 60 + 360) % 360, s, l];
}
export function hslToHex(h: number, s: number, l: number): string {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
	const to = (v: number) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
	return '#' + to(r) + to(g) + to(b);
}

/** The body colour of a faction's gem in a style (the hue is the faction's in every style). */
export function gemColour(color: number, style: GemStyle): string {
	if (color === 6) return style === 'lacquer' ? '#15120f' : style === 'yunzi' ? '#2a2a2d' : '#2a2a2a';
	const [h, s, l] = hexToHsl(LEGACY[color]);
	if (style === 'yunzi') return hslToHex(h, Math.min(0.55, s * 0.6 + 0.12), 0.5 + (l - 0.6) * 0.3);
	if (style === 'lacquer') return hslToHex(h, Math.min(0.85, s * 1.1 + 0.15), Math.min(0.36, l * 0.5));
	return hslToHex(h, Math.min(1, s * 1.35 + 0.15), Math.min(0.5, l * 0.68));
}

function rgb(hex: string): [number, number, number] {
	if (hex.startsWith('rgb')) {
		const [r, g, b] = hex.match(/\d+/g)!.map(Number);
		return [r, g, b];
	}
	const n = parseInt(hex.slice(1, 7), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(hex: string, amount: number): string {
	const [r, g, b] = rgb(hex);
	const f = (v: number) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
	return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function goldGradient(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
	const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
	g.addColorStop(0, '#fff3b8');
	g.addColorStop(0.3, '#e6bb4c');
	g.addColorStop(0.65, '#8f6216');
	g.addColorStop(1, '#f0cd68');
	return g;
}

/** Yunzi: a satin dome, one broad soft highlight, a soft table, a faint warm translucence at the edge. */
export function yunziFace(ctx: CanvasRenderingContext2D, C: number, R: number, hex: string, evil: boolean) {
	ctx.beginPath();
	ctx.arc(C, C, R, 0, Math.PI * 2);
	const g = ctx.createRadialGradient(C - R * 0.3, C - R * 0.35, R * 0.05, C, C, R);
	g.addColorStop(0, shade(hex, evil ? 0.18 : 0.38));
	g.addColorStop(0.6, hex);
	g.addColorStop(0.92, shade(hex, -0.22));
	g.addColorStop(1, shade(hex, evil ? -0.3 : 0.12)); // the edge lets light through
	ctx.fillStyle = g;
	ctx.fill();
	ctx.beginPath();
	ctx.arc(C, C, R * 0.52, 0, Math.PI * 2);
	ctx.lineWidth = 1.6;
	ctx.strokeStyle = evil ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
	ctx.stroke();
	ctx.save();
	ctx.translate(C - R * 0.32, C - R * 0.38);
	ctx.rotate(-0.6);
	ctx.scale(1, 0.62);
	const h = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.55);
	h.addColorStop(0, 'rgba(255,255,255,0.42)');
	h.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = h;
	ctx.beginPath();
	ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
	ctx.beginPath();
	ctx.arc(C, C, R, 0, Math.PI * 2);
	ctx.lineWidth = 1.5;
	ctx.strokeStyle = shade(hex, -0.5);
	ctx.stroke();
}

/** Lacquer: deep colour, a window reflection, a fine gold rim and a gold table ring. */
export function lacquerFace(ctx: CanvasRenderingContext2D, C: number, R: number, hex: string, evil: boolean) {
	ctx.beginPath();
	ctx.arc(C, C, R, 0, Math.PI * 2);
	const g = ctx.createRadialGradient(C - R * 0.2, C - R * 0.25, R * 0.1, C, C, R);
	g.addColorStop(0, shade(hex, evil ? 0.12 : 0.25));
	g.addColorStop(0.7, hex);
	g.addColorStop(1, shade(hex, -0.55));
	ctx.fillStyle = g;
	ctx.fill();
	// the window: a soft-edged band, the way lacquer reflects a room
	ctx.save();
	ctx.beginPath();
	ctx.arc(C, C, R * 0.97, 0, Math.PI * 2);
	ctx.clip();
	ctx.translate(C - R * 0.35, C - R * 0.42);
	ctx.rotate(-0.55);
	const w = ctx.createLinearGradient(0, -R * 0.12, 0, R * 0.12);
	w.addColorStop(0, 'rgba(255,255,255,0)');
	w.addColorStop(0.5, 'rgba(255,255,255,0.55)');
	w.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = w;
	ctx.fillRect(-R * 0.45, -R * 0.12, R * 0.9, R * 0.24);
	ctx.restore();
	const gold = goldGradient(ctx, C, C, R);
	ctx.beginPath();
	ctx.arc(C, C, R * 0.52, 0, Math.PI * 2);
	ctx.lineWidth = 2.2;
	ctx.strokeStyle = gold;
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(C, C, R - 2, 0, Math.PI * 2);
	ctx.lineWidth = 3.5;
	ctx.strokeStyle = gold;
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(C, C, R, 0, Math.PI * 2);
	ctx.lineWidth = 1.2;
	ctx.strokeStyle = 'rgba(30,15,0,0.9)';
	ctx.stroke();
}

/** A pip, by style: ink, bone on Evil, gold inlay on lacquer. */
export function drawPip(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, filled: boolean, kind: 'ink' | 'bone' | 'gold') {
	ctx.beginPath();
	if (filled) {
		ctx.arc(x, y, R * 0.115, 0, Math.PI * 2);
		if (kind === 'gold') {
			ctx.fillStyle = goldGradient(ctx, x, y, R * 0.12);
			ctx.fill();
			ctx.lineWidth = 1.2;
			ctx.strokeStyle = 'rgba(40,20,0,0.8)';
		} else {
			ctx.fillStyle = kind === 'bone' ? '#efe6d2' : '#1d130a';
			ctx.fill();
			ctx.lineWidth = 1.8;
			ctx.strokeStyle = kind === 'bone' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.75)';
		}
		ctx.stroke();
	} else {
		ctx.arc(x, y, R * 0.075, 0, Math.PI * 2);
		ctx.lineWidth = 2;
		ctx.strokeStyle = kind === 'ink' ? 'rgba(20,10,0,0.35)' : 'rgba(255,255,255,0.3)';
		ctx.stroke();
	}
}

/** "Yours", drawn around the gem on a T-sized canvas centred at C. */
export function drawMine(ctx: CanvasRenderingContext2D, C: number, R: number, kind: MineMark) {
	if (kind === 'tile') {
		const h = R * 1.3;
		ctx.save();
		ctx.filter = 'blur(3px)';
		ctx.fillStyle = 'rgba(0,0,0,0.45)';
		ctx.beginPath();
		ctx.roundRect(C - h + 3, C - h + 5, h * 2, h * 2, R * 0.25);
		ctx.fill();
		ctx.restore();
		const g = ctx.createLinearGradient(C - h, C - h, C + h, C + h);
		g.addColorStop(0, '#fffaf0');
		g.addColorStop(1, '#d9cfbd');
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.roundRect(C - h, C - h, h * 2, h * 2, R * 0.25);
		ctx.fill();
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = '#2a1a0a';
		ctx.stroke();
		return;
	}
	if (kind === 'halo') {
		ctx.beginPath();
		ctx.arc(C, C, R * 1.26, 0, Math.PI * 2);
		ctx.lineWidth = R * 0.26;
		ctx.strokeStyle = '#141414';
		ctx.stroke();
		ctx.beginPath();
		ctx.arc(C, C, R * 1.26, 0, Math.PI * 2);
		ctx.lineWidth = R * 0.15;
		ctx.strokeStyle = '#fbf6ea';
		ctx.stroke();
		return;
	}
	// bezel: heavier gold, outlined in black so it holds on wood
	const gold = goldGradient(ctx, C, C, R);
	ctx.beginPath();
	ctx.arc(C, C, R * 1.12, 0, Math.PI * 2);
	ctx.lineWidth = R * 0.34;
	ctx.strokeStyle = '#120a00';
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(C, C, R * 1.12, 0, Math.PI * 2);
	ctx.lineWidth = R * 0.24;
	ctx.strokeStyle = gold;
	ctx.stroke();
	for (let i = 0; i < 4; i++) {
		const a = Math.PI / 4 + (i * Math.PI) / 2;
		ctx.beginPath();
		ctx.arc(C + Math.cos(a) * R * 1.04, C + Math.sin(a) * R * 1.04, R * 0.17, 0, Math.PI * 2);
		ctx.fillStyle = gold;
		ctx.fill();
		ctx.lineWidth = 2;
		ctx.strokeStyle = '#120a00';
		ctx.stroke();
	}
}

// ------------------------------------------------------------------ boards

function lattice(n: number, seed: number) {
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
}

/** A seamless 1024 tile of a board's surface (16 by 16 intersections at 64 px). */
export function boardCanvas(kind: BoardKind, size = 1024): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const img = ctx.createImageData(size, size);
	const n1 = lattice(8, 11), n2 = lattice(32, 23), n3 = lattice(64, 37), n4 = lattice(256, 41);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++) {
			const u = x / size, v = y / size;
			let r = 0, g = 0, b = 0;
			if (kind === 'kaya') {
				const warp = n1(u * 8, v * 8) * 0.9 + n2(u * 32, v * 32) * 0.12;
				const grain = Math.pow(0.5 + 0.5 * Math.sin((u * 96 + warp) * Math.PI * 2), 10);
				const k = 0.22 * grain + 0.07 * n3(u * 64, v * 64) + 0.1 * n1(u * 8 + 3, v * 8 + 5);
				[r, g, b] = [226 - 70 * k, 186 - 66 * k, 124 - 52 * k];
			} else if (kind === 'slate') {
				const strata = n1(u * 8, v * 8 * 0.5) * 0.6 + n2(u * 32, v * 32) * 0.25 + n4(u * 256, v * 256) * 0.15;
				const k = strata;
				[r, g, b] = [44 + 30 * k, 48 + 30 * k, 54 + 32 * k];
			} else if (kind === 'washi') {
				const fibre = Math.pow(n4(u * 256, v * 256 * 0.25), 3) * 0.5 + n3(u * 64, v * 64) * 0.3 + n1(u * 8, v * 8) * 0.2;
				const k = fibre;
				[r, g, b] = [242 - 26 * k, 234 - 28 * k, 214 - 30 * k];
			} else {
				const nap = n4(u * 256, v * 256) * 0.5 + n3(u * 64, v * 64) * 0.3 + n1(u * 8, v * 8) * 0.2;
				const k = nap;
				[r, g, b] = [22 + 22 * k, 70 + 30 * k, 52 + 22 * k];
			}
			const i = (y * size + x) * 4;
			img.data[i] = r;
			img.data[i + 1] = g;
			img.data[i + 2] = b;
			img.data[i + 3] = 255;
		}
	ctx.putImageData(img, 0, 0);
	return canvas;
}

/** The ink of the lines on a board. */
export function lineColour(kind: BoardKind): {color: number; alpha: number; css: string} {
	if (kind === 'slate') return {color: 0xd9d2c0, alpha: 0.7, css: 'rgba(217,210,192,0.75)'};
	if (kind === 'felt') return {color: 0xe2c77a, alpha: 0.6, css: 'rgba(226,199,122,0.65)'};
	if (kind === 'washi') return {color: 0x1a1410, alpha: 0.85, css: 'rgba(26,20,16,0.85)'};
	return {color: 0x24130a, alpha: 0.8, css: 'rgba(36,19,10,0.8)'};
}

/** A label's ink on a board. */
export function labelColour(kind: BoardKind): string {
	return kind === 'slate' || kind === 'felt' ? '#efe6d2' : '#2b1606';
}

/**
 * THROWAWAY PROTOTYPE (branch proto/go-style), round 2: how should a
 * stratagems gem LOOK, and how does it show its life, trend and owner, on a
 * Go-like board. Round 1's verdict (the user, 2026-10-30): bridges and notches
 * and the dial are needed, size works when zoomed out, cracks alone and the
 * owner overlays do not; this round tries four looks.
 *
 * URL params (shareable, reload-stable): look=flat|rich|baked|three,
 * life=dial|size, links=0|1, outlines=0|1, tilt=<deg> (three only),
 * zoom=near|mid|far, cx/cy/px (an exact camera), focus=<address>, ui=0.
 * Keys: left/right look, T turn the cycle, R reset, B links, G faction
 * outlines, L life display, 1/2/3 zoom, Y tilt (three), H hide panel, Esc.
 */
import {Application, Container, Graphics, Sprite, Text, TilingSprite, Texture} from 'pixi.js';
import {type Board, type Cell, EVIL, EVIL_OWNER, MAX_LIFE, factionOutlines, key, linksOf, nextBoard, ownerSummary, pressureOf} from './rules';
import {LABELS, ME, initialBoard} from './scenes';
import {
	COLOURS,
	jewel,
	type Look,
	MARK_RADIUS,
	RT,
	bezelTexture,
	blockieDataURL,
	crossTexture,
	glowTexture,
	huskTexture,
	markAngle,
	pendingTexture,
	rimTexture,
	ringTexture,
	stoneTexture,
	crackTexture,
	woodCanvas,
} from './textures';
import {createThreeView} from './three-view';

const LOOKS: {id: Look; name: string}[] = [
	{id: 'flat', name: 'Flat (round 1)'},
	{id: 'rich', name: 'Rich 2D: wood board, drawn cabochons'},
	{id: 'baked', name: 'Baked: 3D gems rendered once into pixi sprites'},
	{id: 'three', name: 'Live 3D: three.js, physically based'},
];

const S = 64;
const R = 0.38 * S;
const K = R / RT;
const NEAR_PX = 34;

const params = new URLSearchParams(location.search);
const state = {
	look: (params.get('look') as Look) || 'rich',
	life: (params.get('life') as 'dial' | 'size') || 'dial',
	links: params.get('links') !== '0',
	outlines: params.get('outlines') === '1',
	tilt: Number(params.get('tilt') ?? 0),
	focus: params.get('focus') as string | null,
	hover: null as null | {owner: string; cell: Cell},
	pinned: null as null | {owner: string; cell: Cell},
	board: initialBoard(),
	anim: null as null | {start: number; to: Board},
};
let zoomName: string | null = params.get('zoom');

function syncURL() {
	const p = new URLSearchParams();
	p.set('look', state.look);
	p.set('life', state.life);
	p.set('links', state.links ? '1' : '0');
	if (state.outlines) p.set('outlines', '1');
	if (state.tilt) p.set('tilt', String(state.tilt));
	if (zoomName) p.set('zoom', zoomName);
	history.replaceState(null, '', '?' + p.toString());
}

const host = document.getElementById('board')!;
const three = createThreeView(host);
const app = new Application();
await app.init({resizeTo: window, backgroundAlpha: 0, antialias: true, preference: 'webgl', resolution: window.devicePixelRatio || 1, autoDensity: true});
app.canvas.style.cssText = 'position:fixed;inset:0';
host.appendChild(app.canvas);

const world = new Container();
app.stage.addChild(world);
const boardLayer = new Container();
const gridG = new Graphics();
const outlineG = new Graphics();
const linksG = new Graphics();
const under = new Container();
const stones = new Container();
const over = new Container();
const fx = new Container();
const labels = new Container();
world.addChild(boardLayer, gridG, outlineG, linksG, under, stones, over, fx, labels);

const plain = new Graphics().rect(-20000, -20000, 40000, 40000).fill({color: 0xd2a868});
const wood = new TilingSprite({texture: Texture.from(woodCanvas(1024)), width: 64 * 1024, height: 64 * 1024});
wood.position.set(-32 * 1024, -32 * 1024);
boardLayer.addChild(plain, wood);

for (const l of LABELS) {
	const t = new Text({text: l.text, style: {fontFamily: 'Georgia, serif', fontSize: 15, fill: '#2b1606'}, resolution: 3});
	t.position.set(l.x * S, l.y * S);
	labels.addChild(t);
}

// ---------------------------------------------------------------- camera
const camera = {x: 0, y: 0, scale: 1};
function applyCamera() {
	world.scale.set(camera.scale);
	world.position.set(app.screen.width / 2 - camera.x * camera.scale, app.screen.height / 2 - camera.y * camera.scale);
	three.setCamera(camera, app.screen.width, app.screen.height, state.tilt);
}
function preset(name: string) {
	zoomName = name;
	if (name === 'near') Object.assign(camera, {x: 5 * S, y: 2.4 * S, scale: 100 / S});
	else if (name === 'mid') Object.assign(camera, {x: 9 * S, y: 4.5 * S, scale: 56 / S});
	else Object.assign(camera, {x: 30 * S, y: 11 * S, scale: 16 / S});
	onCamera();
}
const spacingPx = () => S * camera.scale;
let zoomClass = '';
function onCamera() {
	applyCamera();
	drawGrid();
	const cls = spacingPx() >= NEAR_PX ? 'near' : 'far';
	labels.visible = spacingPx() > 22 && !(state.look === 'three' && state.tilt);
	if (cls !== zoomClass) {
		zoomClass = cls;
		build();
	}
	updateStatus();
}

function drawGrid() {
	gridG.clear();
	if (state.look === 'three') return;
	const px = 1 / camera.scale;
	const rich = state.look !== 'flat';
	const alpha = Math.min(1, Math.max(0.15, (spacingPx() - 6) / 30));
	const x0 = Math.floor(-world.position.x / camera.scale / S) - 1;
	const x1 = Math.ceil((app.screen.width - world.position.x) / camera.scale / S) + 1;
	const y0 = Math.floor(-world.position.y / camera.scale / S) - 1;
	const y1 = Math.ceil((app.screen.height - world.position.y) / camera.scale / S) + 1;
	for (let x = x0; x <= x1; x++) gridG.moveTo(x * S, y0 * S).lineTo(x * S, y1 * S);
	for (let y = y0; y <= y1; y++) gridG.moveTo(x0 * S, y * S).lineTo(x1 * S, y * S);
	gridG.stroke({width: px * (rich ? 1.4 : 1.2), color: rich ? 0x24130a : 0x4a2c0a, alpha: (rich ? 0.8 : 0.55) * alpha});
	if (rich && spacingPx() > 14) {
		// hoshi: landmarks every 8 intersections, on an unbounded board
		for (let x = Math.ceil(x0 / 8) * 8; x <= x1; x += 8) for (let y = Math.ceil(y0 / 8) * 8; y <= y1; y += 8) gridG.circle(x * S, y * S, S * 0.07);
		gridG.fill({color: 0x24130a, alpha: 0.9 * alpha});
	}
}

// ---------------------------------------------------------------- the pixi board
type Node = {
	cell: Cell;
	trend: ReturnType<typeof pressureOf>['trend'];
	all: Sprite[];
	stone: Sprite;
	baseScale: number;
	pending?: Sprite;
	glow?: Sprite;
	rim?: Sprite;
	next?: Sprite;
	husk?: Sprite;
	dying?: Dying;
	dim: number;
};
type Dying = {g: Graphics; chips: Graphics; cracks: [number, number][][]; impact: [number, number]};
let nodes: Node[] = [];

function sizeOf(life: number) {
	return 0.42 + (0.58 * life) / MAX_LIFE;
}
const dial = () => state.life === 'dial' && zoomClass === 'near';
const sized = () => !dial();
function stoneScale(cell: Cell) {
	if (cell.life === 0 && cell.planned !== 'place') return sized() ? 0.62 : 0.9;
	return sized() ? sizeOf(cell.life) : 1;
}

function sprite(t: Texture, cell: Cell, layer: Container, scale = 1, dx = 0, dy = 0, k = K): Sprite {
	const s = new Sprite(t);
	s.anchor.set(0.5);
	s.position.set(cell.x * S + dx, cell.y * S + dy);
	s.scale.set(k * scale);
	layer.addChild(s);
	return s;
}
function clear(c: Container) {
	for (const child of c.removeChildren()) child.destroy();
}

const focusOwner = () => state.pinned?.owner ?? state.hover?.owner ?? state.focus ?? null;

function build() {
	const isThree = state.look === 'three';
	three.canvas.style.display = isThree ? '' : 'none';
	boardLayer.visible = !isThree;
	plain.visible = state.look === 'flat';
	wood.visible = state.look !== 'flat';
	for (const c of [under, stones, over, fx]) clear(c);
	linksG.clear();
	outlineG.clear();
	nodes = [];
	const focus = focusOwner();
	if (isThree) {
		three.build({board: state.board, sized: sized(), dial: dial(), links: state.links, outlines: state.outlines, focus, sizeOf});
		drawGrid();
		return;
	}
	const look = state.look;
	const board = state.board;
	for (const cell of board.values()) {
		const {trend} = pressureOf(board, cell);
		const ghost = cell.planned === 'place';
		const dead = cell.life === 0 && !ghost;
		const scale = stoneScale(cell);
		const node: Node = {cell, trend, all: [], stone: undefined as unknown as Sprite, baseScale: scale, dim: 1};
		if (dead) {
			node.stone = sprite(huskTexture(cell.color), cell, stones, scale);
			sprite(crackTexture(6), cell, over, scale * 0.95).alpha = 0.55;
			nodes.push(node);
			continue;
		}
		const showTrend = !ghost && (trend === 'grow' || trend === 'shrink');
		if (showTrend && trend === 'grow') node.glow = sprite(glowTexture(), cell, under, scale * 1.02);
		if (cell.owner === ME && !ghost) sprite(bezelTexture(), cell, under, scale);
		let marks: number | undefined;
		if (dial() && !ghost) marks = trend === 'shrink' ? cell.life - 1 : cell.life;
		node.stone = sprite(stoneTexture(cell.color, {marks, stake: cell.stake, look}), cell, stones, scale);
		if (ghost) node.stone.alpha = 0.42;
		if (dial() && !ghost && showTrend) {
			const i = trend === 'shrink' ? cell.life - 1 : cell.life;
			if (i < 7) {
				const a = markAngle(i);
				node.pending = sprite(pendingTexture(trend as 'grow' | 'shrink'), cell, over, 1, Math.cos(a) * R * MARK_RADIUS, Math.sin(a) * R * MARK_RADIUS);
			}
		}
		if (showTrend && trend === 'shrink') node.rim = sprite(rimTexture(), cell, over, scale);
		if (sized() && showTrend && trend === 'grow') node.next = sprite(ringTexture('next'), cell, over, sizeOf(cell.life + 1));
		if (cell.planned === 'remove') sprite(crossTexture(), cell, over, 0.9);
		if (ghost) sprite(ringTexture('next'), cell, over, 1);
		if (trend === 'shrink' && cell.life === 1) {
			node.husk = sprite(huskTexture(cell.color), cell, under, stoneScale({...cell, life: 0}));
			node.husk.alpha = 0;
			node.dying = makeDying(cell);
		}
		nodes.push(node);
	}
	const byCell = new Map<string, Sprite[]>();
	for (const layer of [under, stones, over])
		for (const ch of layer.children as Sprite[]) {
			const k = key(Math.round(ch.position.x / S), Math.round(ch.position.y / S));
			(byCell.get(k) ?? byCell.set(k, []).get(k)!).push(ch);
		}
	for (const n of nodes) {
		n.all = byCell.get(key(n.cell.x, n.cell.y)) ?? [];
		const lit = n.cell.owner === focus || (focus === EVIL_OWNER && n.cell.color === EVIL);
		if (focus && !lit) {
			n.dim = 0.2;
			for (const s of n.all) s.alpha *= 0.2;
		}
		if (focus && lit) sprite(ringTexture('halo'), n.cell, under, n.baseScale);
	}
	drawLinks(focus);
	drawOutlines();
}

function drawLinks(focus: string | null) {
	if (!state.links) return;
	const board = state.board;
	for (const l of linksOf(board)) {
		const a = board.get(key(l.ax, l.ay))!;
		const b = board.get(key(l.bx, l.by))!;
		const both = !focus || (a.owner === focus && b.owner === focus);
		const either = !focus || a.owner === focus || b.owner === focus;
		const dim = l.kind === 'bridge' ? (both ? 1 : 0.15) : either ? 1 : 0.15;
		const ra = R * 0.8 * stoneScale(a);
		const rb = R * 0.8 * stoneScale(b);
		const horizontal = l.ay === l.by;
		const [x1, y1, x2, y2] = horizontal ? [l.ax * S + ra, l.ay * S, l.bx * S - rb, l.by * S] : [l.ax * S, l.ay * S + ra, l.bx * S, l.by * S - rb];
		if (l.kind === 'bridge') {
			const w = S * 0.26;
			const col = parseInt((state.look === 'flat' ? (a.color === EVIL ? '#2c2c2c' : COLOURS[a.color]) : jewel(a.color)).slice(1, 7), 16);
			const rect = () => (x1 === x2 ? linksG.roundRect(x1 - w / 2, y1, w, y2 - y1, w / 3) : linksG.roundRect(x1, y1 - w / 2, x2 - x1, w, w / 3));
			rect().fill({color: col, alpha: dim});
			rect().stroke({width: 2, color: 0x2a1a08, alpha: 0.6 * dim});
		} else {
			const mx = ((l.ax + l.bx) * S) / 2;
			const my = ((l.ay + l.by) * S) / 2;
			const h = S * 0.16;
			const t = S * 0.07;
			if (y1 === y2) linksG.poly([mx - t, my - h, mx + t, my - h, mx, my - h * 0.15]).poly([mx - t, my + h, mx + t, my + h, mx, my + h * 0.15]);
			else linksG.poly([mx - h, my - t, mx - h, my + t, mx - h * 0.15, my]).poly([mx + h, my - t, mx + h, my + t, mx + h * 0.15, my]);
			linksG.fill({color: 0xb3171d, alpha: dim});
			linksG.moveTo(x1, y1).lineTo(x2, y2).stroke({width: 3, color: 0xb3171d, alpha: 0.75 * dim});
		}
	}
}

function drawOutlines() {
	if (!state.outlines) return;
	for (const [color, segs] of factionOutlines(state.board)) {
		for (const s of segs) outlineG.moveTo(s.x1 * S, s.y1 * S).lineTo(s.x2 * S, s.y2 * S);
		const col = parseInt(jewel(color).slice(1, 7), 16);
		outlineG.stroke({width: 4, color: col, alpha: 0.9, cap: 'round'});
	}
}

// ---------------------------------------------------------------- cracking
function makeDying(cell: Cell): Dying {
	let seed = cell.x * 31 + cell.y * 17 + 5;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	const impact: [number, number] = [(rand() - 0.5) * R * 0.5, (rand() - 0.5) * R * 0.5];
	const cracks: [number, number][][] = [];
	const n = 6;
	for (let i = 0; i < n; i++) {
		let a = (i / n) * Math.PI * 2 + rand() * 0.6;
		let [x, y] = impact;
		const pts: [number, number][] = [[x, y]];
		while (Math.hypot(x, y) < R * 0.98) {
			a += (rand() - 0.5) * 0.7;
			x += Math.cos(a) * R * 0.16;
			y += Math.sin(a) * R * 0.16;
			pts.push([x, y]);
		}
		cracks.push(pts);
		if (rand() < 0.6) {
			// a branch
			const j = 1 + Math.floor(rand() * (pts.length - 2));
			let [bx, by] = pts[j];
			let ba = a + (rand() < 0.5 ? 0.9 : -0.9);
			const br: [number, number][] = [[bx, by]];
			for (let k = 0; k < 3 && Math.hypot(bx, by) < R * 0.95; k++) {
				bx += Math.cos(ba) * R * 0.13;
				by += Math.sin(ba) * R * 0.13;
				ba += (rand() - 0.5) * 0.6;
				br.push([bx, by]);
			}
			cracks.push(br);
		}
	}
	const g = new Graphics();
	const chips = new Graphics();
	g.position.set(cell.x * S, cell.y * S);
	chips.position.set(cell.x * S, cell.y * S);
	fx.addChild(g, chips);
	return {g, chips, cracks, impact};
}

/** Cracks race out from an impact, the stone shudders, chips fly, and it sinks into its husk. */
function animateDying(n: Node, p: number) {
	const d = n.dying!;
	const grow = Math.min(1, p / 0.35);
	d.g.clear();
	const sinking = Math.max(0, (p - 0.65) / 0.35);
	for (const pts of d.cracks) {
		const upto = grow * (pts.length - 1);
		const k = Math.floor(upto);
		if (k < 1 && upto <= 0) continue;
		d.g.moveTo(pts[0][0], pts[0][1]);
		for (let i = 1; i <= k; i++) d.g.lineTo(pts[i][0], pts[i][1]);
		if (k < pts.length - 1) {
			const f = upto - k;
			d.g.lineTo(pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f);
		}
	}
	d.g.stroke({width: R * 0.07, color: 0x140a02, alpha: 1 - sinking, join: 'round', cap: 'round'});
	for (const pts of d.cracks) {
		const upto = Math.floor(grow * (pts.length - 1));
		d.g.moveTo(pts[0][0] + 1, pts[0][1] + 1);
		for (let i = 1; i <= upto; i++) d.g.lineTo(pts[i][0] + 1, pts[i][1] + 1);
	}
	d.g.stroke({width: R * 0.035, color: 0xffffff, alpha: 0.7 * (1 - sinking), join: 'round', cap: 'round'});
	d.g.circle(d.impact[0], d.impact[1], R * 0.12 * grow).fill({color: 0xffffff, alpha: 0.6 * (1 - grow)});
	// shudder while it cracks
	const shake = p > 0.2 && p < 0.55 ? Math.sin(p * 140) * 2.2 * (1 - Math.abs(p - 0.37) / 0.18) : 0;
	n.stone.position.x = n.cell.x * S + shake;
	d.g.position.x = n.cell.x * S + shake;
	// chips fly from the crack ends
	d.chips.clear();
	const q = Math.max(0, (p - 0.3) / 0.55);
	if (q > 0 && q < 1) {
		const col = parseInt(jewel(n.cell.color).slice(1, 7), 16);
		d.cracks.forEach((pts, i) => {
			const [ex, ey] = pts[pts.length - 1];
			const a = Math.atan2(ey, ex);
			const dist = R * 0.6 * q;
			const cx = ex + Math.cos(a) * dist;
			const cy = ey + Math.sin(a) * dist + R * 0.8 * q * q;
			const r = R * (0.13 + 0.05 * (i % 3));
			const rot = q * 6 + i;
			d.chips.poly([cx + Math.cos(rot) * r, cy + Math.sin(rot) * r, cx + Math.cos(rot + 2.2) * r, cy + Math.sin(rot + 2.2) * r, cx + Math.cos(rot + 4.1) * r * 0.7, cy + Math.sin(rot + 4.1) * r * 0.7]);
			d.chips.fill({color: col, alpha: 1 - q});
		});
	}
	for (const s of n.all) if (s !== n.husk) s.alpha = Math.min(s.alpha, 1 - sinking);
	n.husk!.alpha = sinking;
	n.stone.scale.set(K * (n.baseScale + (stoneScale({...n.cell, life: 0}) - n.baseScale) * sinking));
}

// ---------------------------------------------------------------- ticker
const TURN_MS = 1600;
app.ticker.add(() => {
	const now = performance.now();
	const t = now / 1000;
	if (state.look === 'three') three.frame(t);
	const anim = state.anim;
	const p = anim ? Math.min(1, (now - anim.start) / TURN_MS) : 0;
	// one pulse, in step for every gem: slow, wide, readable
	const k = 0.5 + 0.5 * Math.sin(t * 4);
	for (const n of nodes) {
		if (!anim) {
			if (n.pending) {
				n.pending.alpha = n.dim * (0.2 + 0.8 * k);
				n.pending.scale.set(K * (1 + 0.35 * k));
			}
			continue;
		}
		const to = anim.to.get(key(n.cell.x, n.cell.y));
		if (!to || n.cell.life === 0) continue;
		const fade = 1 - Math.min(1, p * 3);
		if (n.glow) n.glow.alpha = fade;
		if (n.next) n.next.alpha = fade;
		if (to.life === 0) {
			animateDying(n, p);
			continue;
		}
		if (n.rim) n.rim.alpha = fade;
		const e = 1 - (1 - p) ** 3;
		if (n.pending) {
			n.pending.alpha = n.trend === 'grow' ? 1 : 1 - e;
			n.pending.scale.set(K * (n.trend === 'grow' ? 1 + 0.8 * Math.sin(Math.min(1, p * 1.4) * Math.PI) : 1 + 0.6 * e));
		}
		if (sized()) n.stone.scale.set(K * (sizeOf(n.cell.life) + (sizeOf(to.life) - sizeOf(n.cell.life)) * e));
	}
	if (anim && p >= 1) {
		state.board = anim.to;
		state.anim = null;
		build();
		updateCard();
		updateStatus();
	}
});

function turn() {
	if (state.anim) return;
	state.anim = {start: performance.now(), to: nextBoard(state.board)};
	if (state.look === 'three') {
		state.board = state.anim.to;
		state.anim = null;
		build();
	}
}

// ---------------------------------------------------------------- input
let drag: null | {x: number; y: number; cx: number; cy: number; moved: boolean} = null;
const target = app.canvas;
target.addEventListener('pointerdown', (e) => {
	drag = {x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y, moved: false};
});
function toWorld(e: {clientX: number; clientY: number}) {
	if (state.look === 'three') return three.screenToWorld(e.clientX, e.clientY, app.screen.width, app.screen.height);
	return {x: (e.clientX - world.position.x) / camera.scale, y: (e.clientY - world.position.y) / camera.scale};
}
/** The cell whose square holds the point: no gaps between neighbours, so no flicker crossing them. */
function cellAt(e: {clientX: number; clientY: number}): Cell | undefined {
	const w = toWorld(e);
	if (!w) return;
	const c = state.board.get(key(Math.round(w.x / S), Math.round(w.y / S)));
	return c && c.planned !== 'place' ? c : undefined;
}
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
function setHover(c: Cell | undefined) {
	const next = c ? {owner: c.owner, cell: c} : null;
	if (!next) {
		// leaving to empty board: keep the highlight a moment, so a quick pass does not blink
		if (state.hover && !leaveTimer)
			leaveTimer = setTimeout(() => {
				leaveTimer = undefined;
				state.hover = null;
				build();
				updateCard();
			}, 250);
		return;
	}
	clearTimeout(leaveTimer);
	leaveTimer = undefined;
	const sameOwner = state.hover?.owner === next.owner;
	const sameCell = state.hover?.cell === next.cell;
	state.hover = next;
	if (!sameOwner && !state.pinned) build();
	if (!sameCell) updateCard();
}
window.addEventListener('pointermove', (e) => {
	if (drag) {
		const dx = e.clientX - drag.x;
		const dy = e.clientY - drag.y;
		if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
		if (drag.moved) {
			const tiltK = state.look === 'three' && state.tilt ? 1 / Math.cos((state.tilt * Math.PI) / 180) : 1;
			camera.x = drag.cx - dx / camera.scale;
			camera.y = drag.cy - (dy * tiltK) / camera.scale;
			zoomName = null;
			applyCamera();
			drawGrid();
		}
		return;
	}
	if (e.target !== target) return;
	setHover(cellAt(e));
});
window.addEventListener('pointerup', (e) => {
	if (drag && !drag.moved && e.target === target) {
		const c = cellAt(e);
		state.pinned = c && !(state.pinned && state.pinned.cell === c) ? {owner: c.owner, cell: c} : null;
		build();
		updateCard();
	}
	if (drag?.moved) syncURL();
	drag = null;
});
target.addEventListener(
	'wheel',
	(e) => {
		e.preventDefault();
		const before = toWorld(e);
		camera.scale = Math.min(4, Math.max(0.12, camera.scale * Math.exp(-e.deltaY * 0.0015)));
		applyCamera();
		const after = toWorld(e);
		if (before && after) {
			camera.x += before.x - after.x;
			camera.y += before.y - after.y;
		}
		zoomName = null;
		onCamera();
		syncURL();
	},
	{passive: false},
);

function setLook(l: Look) {
	state.look = l;
	drawGrid();
	onCamera();
	build();
	renderUI();
	syncURL();
}
const cycleLook = (d: number) => setLook(LOOKS[(LOOKS.findIndex((v) => v.id === state.look) + d + LOOKS.length) % LOOKS.length].id);
window.addEventListener('keydown', (e) => {
	if (e.key === 'ArrowRight') cycleLook(1);
	else if (e.key === 'ArrowLeft') cycleLook(-1);
	else if (e.key === 't' || e.key === 'T') turn();
	else if (e.key === 'r' || e.key === 'R') reset();
	else if (e.key === 'b' || e.key === 'B') toggle('links');
	else if (e.key === 'g' || e.key === 'G') toggle('outlines');
	else if (e.key === 'l' || e.key === 'L') setLife(state.life === 'dial' ? 'size' : 'dial');
	else if (e.key === 'y' || e.key === 'Y') setTilt(state.tilt ? 0 : 35);
	else if (e.key === '1') preset('near');
	else if (e.key === '2') preset('mid');
	else if (e.key === '3') preset('far');
	else if (e.key === 'h' || e.key === 'H') $('controls').style.display = $('controls').style.display === 'none' ? '' : 'none';
	else if (e.key === 'Escape') {
		state.pinned = null;
		build();
		updateCard();
	}
	syncURL();
});
function toggle(k: 'links' | 'outlines') {
	state[k] = !state[k];
	build();
	renderUI();
}
function setLife(l: 'dial' | 'size') {
	state.life = l;
	build();
	renderUI();
}
function setTilt(t: number) {
	state.tilt = t;
	onCamera();
	renderUI();
}
function reset() {
	state.board = initialBoard();
	state.anim = null;
	build();
}

// ---------------------------------------------------------------- HTML UI
const $ = (id: string) => document.getElementById(id)!;
function renderUI() {
	const v = LOOKS.find((x) => x.id === state.look)!;
	$('variant-label').textContent = `${v.name}`;
	for (const x of LOOKS) ($(`look-${x.id}`) as HTMLInputElement).checked = x.id === state.look;
	($('life-dial') as HTMLInputElement).checked = state.life === 'dial';
	($('life-size') as HTMLInputElement).checked = state.life === 'size';
	($('links') as HTMLInputElement).checked = state.links;
	($('outlines') as HTMLInputElement).checked = state.outlines;
	($('tilt') as HTMLInputElement).checked = !!state.tilt;
}
const short = (a: string) => a.slice(0, 6) + '...' + a.slice(-4);
const who = (a: string) => `<img src="${blockieDataURL(a, 24)}" width="20" height="20" style="image-rendering:pixelated;border-radius:4px;vertical-align:middle"/> <span class="addr">${short(a)}</span>${a === ME ? ' <b>(you)</b>' : ''}`;
function updateCard() {
	const sel = state.pinned ?? state.hover;
	const card = $('card');
	if (!sel) {
		card.style.display = 'none';
		return;
	}
	const {cell} = sel;
	const hint = `<div class="hint">${state.pinned ? 'pinned: tap again or Esc to clear' : 'hover: tap to pin'}</div>`;
	card.style.display = 'block';
	const {trend, friends, enemies} = pressureOf(state.board, cell);
	const lifeLine = cell.life === 0 ? '' : `<div>life ${'&#9679;'.repeat(cell.life)}${'&#9675;'.repeat(MAX_LIFE - cell.life)} ${trend === 'grow' ? 'growing' : trend === 'shrink' ? 'shrinking' : 'full'} (${friends} friends, ${enemies} enemies)</div>`;
	if (cell.color === EVIL) {
		const list = (cell.contributors ?? []).map((a) => `<li>${who(a)}</li>`).join('');
		card.innerHTML = `<div class="title">Evil, ${cell.stake} gems at stake</div>${lifeLine}
		<div>made by a collision of:</div><ul>${list}</ul>
		<div class="bounty">${cell.life === 0 ? 'dead: its gems went to its enemies' : `if it dies, its ${cell.stake} gems go to its enemies' owners`}</div>${hint}`;
		return;
	}
	if (cell.life === 0) {
		card.innerHTML = `<div class="title">A dead ${['', 'blue', 'red', 'green', 'yellow', 'purple'][cell.color]} cell</div>
		<div>still counts for its neighbours; free to anyone</div><div>last owner ${who(cell.owner)}</div>${hint}`;
		return;
	}
	const s = ownerSummary(state.board, cell.owner);
	card.innerHTML = `<div class="title">${who(cell.owner)}</div>${lifeLine}
	<div>owner of ${s.cells} living cells, ${s.stake} gems at stake</div>
	<div class="sw">${s.colors.map((c) => `<span style="background:${COLOURS[c]}"></span>`).join('')}</div>${hint}`;
}
function updateStatus() {
	let gpu = '';
	const gl = (app.renderer as unknown as {gl?: WebGL2RenderingContext}).gl;
	if (gl) {
		const ext = gl.getExtension('WEBGL_debug_renderer_info');
		gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
	}
	$('status').textContent = `${gpu} | ${state.board.size} cells | ${spacingPx().toFixed(0)} px per intersection (${zoomClass})`;
	(window as unknown as {__proto: unknown}).__proto = {look: state.look, gpu, cells: state.board.size, zoomClass, fps: app.ticker.FPS, three: state.look === 'three' ? three.info() : undefined};
}
for (const x of LOOKS) $(`look-${x.id}`).addEventListener('change', () => setLook(x.id));
$('life-dial').addEventListener('change', () => setLife('dial'));
$('life-size').addEventListener('change', () => setLife('size'));
$('links').addEventListener('change', () => toggle('links'));
$('outlines').addEventListener('change', () => toggle('outlines'));
$('tilt').addEventListener('change', () => setTilt(state.tilt ? 0 : 35));
$('turn').addEventListener('click', turn);
$('reset').addEventListener('click', reset);
$('hide').addEventListener('click', () => ($('controls').style.display = 'none'));
$('prev').addEventListener('click', () => cycleLook(-1));
$('next').addEventListener('click', () => cycleLook(1));
for (const z of ['near', 'mid', 'far']) $(`z-${z}`).addEventListener('click', () => (preset(z), syncURL()));
if (params.get('ui') === '0') $('controls').style.display = 'none';

renderUI();
preset(zoomName ?? 'near');
if (params.get('cx')) {
	Object.assign(camera, {x: Number(params.get('cx')) * S, y: Number(params.get('cy')) * S, scale: Number(params.get('px') ?? 100) / S});
	onCamera();
}
build();
syncURL();
window.addEventListener('resize', () => onCamera());
Object.assign(window as object, {
	__turn: turn,
	__hover: (x: number, y: number, pin = false) => {
		const c = state.board.get(key(x, y));
		if (pin) state.pinned = c ? {owner: c.owner, cell: c} : null;
		else setHover(c);
		build();
		updateCard();
	},
});

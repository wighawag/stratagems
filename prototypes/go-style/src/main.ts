/**
 * THROWAWAY PROTOTYPE (branch proto/go-style): three ways to show a stratagems
 * cell's life and trend on a Go-like board, rendered with pixi.js 8, plus the
 * ownership layers. Question: which style should step 9 build?
 *
 * URL params (shareable, reload-stable): variant=a|b|c, zoom=near|mid|far,
 * links=0|1, owners=0|1, outlines=0|1, focus=<owner address>.
 * Keys: left/right variant, T turn the cycle, R reset, B links, O owners,
 * G outlines, 1/2/3 zoom presets, Esc clear focus.
 */
import {Application, Container, Graphics, Sprite, Text, type Texture} from 'pixi.js';
import {type Board, type Cell, EVIL, MAX_LIFE, key, linksOf, nextBoard, ownerOutline, ownerSummary, pressureOf} from './rules';
import {LABELS, ME, initialBoard} from './scenes';
import {
	COLOURS,
	MARK_RADIUS,
	RT,
	blockieColour,
	blockieDataURL,
	crackTexture,
	crossTexture,
	dotTexture,
	glowTexture,
	inlayTexture,
	markAngle,
	markTexture,
	rimTexture,
	ringTexture,
	stoneTexture,
} from './textures';

type Variant = 'a' | 'b' | 'c';
const VARIANTS: {id: Variant; name: string}[] = [
	{id: 'a', name: 'Dial of seven marks (size at far zoom)'},
	{id: 'b', name: 'Stone size only'},
	{id: 'c', name: 'Cracks for damage, no dial'},
];

/** World units between two intersections. */
const S = 64;
/** Stone radius at full life, in world units. */
const R = 0.38 * S;
const K = R / RT; // texture px to world
/** Below this many screen pixels between intersections, the dial gives way to size. */
const NEAR_PX = 34;
/** Above this, the Owners overlay draws blockie inlays. */
const INLAY_PX = 64;

const params = new URLSearchParams(location.search);
const state = {
	variant: (params.get('variant') as Variant) || 'a',
	links: params.get('links') !== null ? params.get('links') === '1' : params.get('variant') !== 'c',
	owners: params.get('owners') === '1',
	outlines: params.get('outlines') === '1',
	focus: params.get('focus') as string | null,
	hover: null as string | null,
	board: initialBoard(),
	anim: null as null | {start: number; to: Board},
};

function syncURL() {
	const p = new URLSearchParams();
	p.set('variant', state.variant);
	p.set('links', state.links ? '1' : '0');
	if (state.owners) p.set('owners', '1');
	if (state.outlines) p.set('outlines', '1');
	if (state.focus) p.set('focus', state.focus);
	if (zoomName) p.set('zoom', zoomName);
	history.replaceState(null, '', '?' + p.toString());
}

const app = new Application();
await app.init({resizeTo: window, background: '#d2a868', antialias: true, preference: 'webgl', resolution: window.devicePixelRatio || 1, autoDensity: true});
document.getElementById('board')!.appendChild(app.canvas);

const world = new Container();
app.stage.addChild(world);
const gridG = new Graphics();
const linksG = new Graphics();
const outlineG = new Graphics();
const under = new Container();
const stones = new Container();
const over = new Container();
const labels = new Container();
world.addChild(gridG, outlineG, linksG, under, stones, over, labels);

for (const l of LABELS) {
	const t = new Text({text: l.text, style: {fontFamily: 'Georgia, serif', fontSize: 15, fill: '#3b2408'}, resolution: 3});
	t.position.set(l.x * S, l.y * S);
	labels.addChild(t);
}

// ---------------------------------------------------------------- camera
let zoomName: string | null = params.get('zoom');
const camera = {x: 0, y: 0, scale: 1};
function applyCamera() {
	world.scale.set(camera.scale);
	world.position.set(app.screen.width / 2 - camera.x * camera.scale, app.screen.height / 2 - camera.y * camera.scale);
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
	const cls = (spacingPx() >= NEAR_PX ? 'near' : 'far') + (spacingPx() >= INLAY_PX ? '+inlay' : '');
	labels.visible = spacingPx() > 22;
	if (cls !== zoomClass) {
		zoomClass = cls;
		build();
	}
	updateStatus();
}

function drawGrid() {
	gridG.clear();
	const px = 1 / camera.scale; // one screen pixel in world units
	const alpha = Math.min(1, Math.max(0.15, (spacingPx() - 6) / 30));
	// the board is unbounded: lines over whatever is visible
	const x0 = Math.floor((-world.position.x / camera.scale) / S) - 1;
	const x1 = Math.ceil(((app.screen.width - world.position.x) / camera.scale) / S) + 1;
	const y0 = Math.floor((-world.position.y / camera.scale) / S) - 1;
	const y1 = Math.ceil(((app.screen.height - world.position.y) / camera.scale) / S) + 1;
	for (let x = x0; x <= x1; x++) gridG.moveTo(x * S, y0 * S).lineTo(x * S, y1 * S);
	for (let y = y0; y <= y1; y++) gridG.moveTo(x0 * S, y * S).lineTo(x1 * S, y * S);
	gridG.stroke({width: px * 1.2, color: 0x4a2c0a, alpha: 0.55 * alpha});
}

// ---------------------------------------------------------------- nodes
type Node = {
	cell: Cell;
	trend: ReturnType<typeof pressureOf>['trend'];
	all: Sprite[];
	stone: Sprite;
	baseScale: number;
	pulse?: Sprite;
	glow?: Sprite;
	rim?: Sprite;
	next?: Sprite;
	crack?: Sprite;
	crackNext?: Sprite;
	death?: Sprite;
	phase: number;
	dim: number;
};
let nodes: Node[] = [];

function sizeOf(life: number) {
	return 0.42 + (0.58 * life) / MAX_LIFE;
}
const dial = () => state.variant === 'a' && zoomClass.startsWith('near');
const sized = () => state.variant === 'b' || (state.variant === 'a' && !zoomClass.startsWith('near'));

function sprite(t: Texture, cell: Cell, layer: Container, scale = 1, dx = 0, dy = 0): Sprite {
	const s = new Sprite(t);
	s.anchor.set(0.5);
	s.position.set(cell.x * S + dx, cell.y * S + dy);
	s.scale.set(K * scale * (t.width === 32 ? 1 : 1));
	layer.addChild(s);
	return s;
}

function clear(c: Container) {
	for (const child of c.removeChildren()) child.destroy();
}

function build() {
	clear(under);
	clear(stones);
	clear(over);
	nodes = [];
	const board = state.board;
	const focus = state.focus ?? state.hover;
	for (const cell of board.values()) {
		const {trend} = pressureOf(board, cell);
		const evil = cell.color === EVIL;
		const ghost = cell.planned === 'place';
		const scale = sized() && !evil ? sizeOf(cell.life) : 1;
		const node: Node = {cell, trend, all: [], stone: undefined as unknown as Sprite, baseScale: scale, dim: 1, phase: (cell.x * 7 + cell.y * 13) % 10};
		const showTrend = !ghost && (trend === 'grow' || trend === 'shrink');
		if (showTrend && trend === 'grow') node.glow = sprite(glowTexture(), cell, under, scale * 1.02);
		let marks: number | undefined;
		if (dial() && !evil && !ghost) marks = trend === 'shrink' ? cell.life - 1 : cell.life;
		node.stone = sprite(stoneTexture(cell.color, {marks, stake: cell.stake}), cell, stones, scale);
		if (ghost) node.stone.alpha = 0.42;
		if (dial() && !evil && !ghost) {
			const i = trend === 'shrink' ? cell.life - 1 : cell.life;
			if ((trend === 'grow' || trend === 'shrink') && i < 7) {
				const a = markAngle(i);
				node.pulse = sprite(markTexture(), cell, over, 1, Math.cos(a) * R * MARK_RADIUS, Math.sin(a) * R * MARK_RADIUS);
				node.pulse.scale.set(K);
			}
		}
		if (state.variant === 'c' && !evil && !ghost) {
			const damage = MAX_LIFE - cell.life;
			if (damage > 0) node.crack = sprite(crackTexture(Math.min(6, damage)), cell, over, scale);
			if (trend === 'grow' || trend === 'shrink') {
				const nextDamage = damage + (trend === 'shrink' ? 1 : -1);
				node.crackNext = sprite(crackTexture(Math.max(0, Math.min(6, nextDamage))), cell, over, scale);
				node.crackNext.alpha = 0;
			}
		}
		if (showTrend && trend === 'shrink') node.rim = sprite(rimTexture(), cell, over, scale);
		if (sized() && showTrend && trend === 'grow') {
			node.next = sprite(ringTexture('next'), cell, over, sizeOf(cell.life + 1));
		}
		if (cell.planned === 'remove') sprite(crossTexture(), cell, over, 0.9);
		if (ghost) sprite(ringTexture('next'), cell, over, 1);
		const inlay = state.owners && zoomClass.includes('inlay') && !evil;
		if (inlay) sprite(inlayTexture(cell.owner, cell.owner === ME), cell, over, Math.min(1, scale + 0.15));
		else if (cell.owner === ME && !ghost) sprite(dotTexture(), cell, over, Math.max(0.7, scale));
		if (focus && cell.owner === focus && !ghost) sprite(ringTexture('halo'), cell, under, scale);
		node.death = sprite(crackTexture(6), cell, over, scale);
		node.death.alpha = 0;
		nodes.push(node);
	}
	// group membership of sprites by cell, for dimming and fading
	const byCell = new Map<string, Sprite[]>();
	for (const layer of [under, stones, over])
		for (const ch of layer.children as Sprite[]) {
			const k = key(Math.round(ch.position.x / S), Math.round(ch.position.y / S));
			(byCell.get(k) ?? byCell.set(k, []).get(k)!).push(ch);
		}
	for (const n of nodes) {
		n.all = byCell.get(key(n.cell.x, n.cell.y)) ?? [];
		if (focus && n.cell.owner !== focus) {
			n.dim = 0.2;
			for (const s of n.all) s.alpha *= 0.2;
		}
	}
	drawLinks(focus);
	drawOutlines();
}

function drawLinks(focus: string | null) {
	linksG.clear();
	if (!state.links) return;
	const board = state.board;
	for (const l of linksOf(board)) {
		const a = board.get(key(l.ax, l.ay))!;
		const b = board.get(key(l.bx, l.by))!;
		const both = !focus || (a.owner === focus && b.owner === focus);
		const either = !focus || a.owner === focus || b.owner === focus;
		const dim = l.kind === 'bridge' ? (both ? 1 : 0.15) : either ? 1 : 0.15;
		// from rim to rim: a link never shows through a dimmed stone
		const ra = R * 0.8 * (sized() ? sizeOf(a.life) : 1);
		const rb = R * 0.8 * (sized() ? sizeOf(b.life) : 1);
		const horizontal = l.ay === l.by;
		const [x1, y1, x2, y2] = horizontal
			? [l.ax * S + ra, l.ay * S, l.bx * S - rb, l.by * S]
			: [l.ax * S, l.ay * S + ra, l.bx * S, l.by * S - rb];
		if (l.kind === 'bridge') {
			const w = S * 0.26;
			const col = parseInt(COLOURS[a.color].slice(1, 7), 16);
			if (x1 === x2) linksG.roundRect(x1 - w / 2, y1, w, y2 - y1, w / 3);
			else linksG.roundRect(x1, y1 - w / 2, x2 - x1, w, w / 3);
			linksG.fill({color: col, alpha: dim});
			if (x1 === x2) linksG.roundRect(x1 - w / 2, y1, w, y2 - y1, w / 3);
			else linksG.roundRect(x1, y1 - w / 2, x2 - x1, w, w / 3);
			linksG.stroke({width: 2, color: 0x2a1a08, alpha: 0.6 * dim});
		} else {
			const mx = ((l.ax + l.bx) * S) / 2;
			const my = ((l.ay + l.by) * S) / 2;
			const h = S * 0.16;
			const t = S * 0.07;
			// a red pinch on the shared line: two wedges pointing at each other
			if (y1 === y2) {
				linksG.poly([mx - t, my - h, mx + t, my - h, mx, my - h * 0.15]).poly([mx - t, my + h, mx + t, my + h, mx, my + h * 0.15]);
			} else {
				linksG.poly([mx - h, my - t, mx - h, my + t, mx - h * 0.15, my]).poly([mx + h, my - t, mx + h, my + t, mx + h * 0.15, my]);
			}
			linksG.fill({color: 0xb3171d, alpha: dim});
			linksG.moveTo(x1, y1).lineTo(x2, y2).stroke({width: 3, color: 0xb3171d, alpha: 0.75 * dim});
		}
	}
}

function drawOutlines() {
	outlineG.clear();
	if (!state.owners || !state.outlines) return;
	const owners = new Set([...state.board.values()].filter((c) => c.color !== EVIL).map((c) => c.owner));
	for (const owner of owners) {
		const segs = ownerOutline(state.board, owner);
		const col = blockieColour(owner);
		for (const s of segs) outlineG.moveTo(s.x1 * S, s.y1 * S).lineTo(s.x2 * S, s.y2 * S);
		outlineG.stroke({width: 3.5, color: col, alpha: 0.95, cap: 'round'});
	}
}

// ---------------------------------------------------------------- animation
const TURN_MS = 1300;
app.ticker.add(() => {
	const now = performance.now();
	const t = now / 1000;
	const anim = state.anim;
	const p = anim ? Math.min(1, (now - anim.start) / TURN_MS) : 0;
	for (const n of nodes) {
		if (!anim) {
			if (n.glow) n.glow.alpha = n.dim * (0.45 + 0.35 * Math.sin(t * 2 + n.phase));
			if (n.pulse) n.pulse.alpha = n.dim * (n.trend === 'grow' ? 0.12 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2.4 + n.phase)) : 0.25 + 0.75 * Math.abs(Math.sin(t * 6 + n.phase)) * (Math.sin(t * 17 + n.phase) > -0.6 ? 1 : 0.2));
			if (n.next) n.next.alpha = n.dim * (0.35 + 0.35 * Math.sin(t * 2 + n.phase));
			continue;
		}
		const to = anim.to.get(key(n.cell.x, n.cell.y));
		const fade = 1 - Math.min(1, p * 3);
		if (n.glow) n.glow.alpha = 0.6 * fade;
		if (n.rim) n.rim.alpha = Math.max(fade, to ? 0 : 1);
		if (n.next) n.next.alpha = 0.5 * fade;
		if (!to) {
			// dies: cracks run across it, then it fades
			n.death!.alpha = Math.min(1, p * 2.2);
			const q = Math.max(0, (p - 0.45) / 0.55);
			for (const s of n.all) if (s !== n.death) s.alpha = Math.min(s.alpha, 1 - q);
			n.death!.alpha *= 1 - q;
			n.stone.scale.set(K * n.baseScale * (1 - 0.12 * q));
			continue;
		}
		const e = 1 - (1 - p) ** 3;
		if (n.pulse) {
			if (n.trend === 'grow') {
				n.pulse.alpha = Math.min(1, 0.3 + p * 2);
				n.pulse.scale.set(K * (1 + 0.9 * Math.sin(Math.min(1, p * 1.4) * Math.PI)));
			} else {
				n.pulse.alpha = 1 - e;
				n.pulse.scale.set(K * (1 + 0.6 * e));
			}
		}
		if (sized() && n.cell.color !== EVIL) {
			const s = sizeOf(n.cell.life) + (sizeOf(to.life) - sizeOf(n.cell.life)) * e;
			n.stone.scale.set(K * s);
		}
		if (n.crackNext) {
			n.crackNext.alpha = e;
			if (n.crack) n.crack.alpha = 1 - e;
		}
	}
	if (anim && p >= 1) {
		state.board = anim.to;
		state.anim = null;
		build();
		updateStatus();
	}
});

function turn() {
	if (state.anim) return;
	state.anim = {start: performance.now(), to: nextBoard(state.board)};
}

// ---------------------------------------------------------------- input
const canvas = app.canvas;
let drag: null | {x: number; y: number; cx: number; cy: number; moved: boolean} = null;
canvas.addEventListener('pointerdown', (e) => {
	drag = {x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y, moved: false};
});
function cellAt(e: PointerEvent | MouseEvent): Cell | undefined {
	const wx = (e.clientX - world.position.x) / camera.scale;
	const wy = (e.clientY - world.position.y) / camera.scale;
	const c = state.board.get(key(Math.round(wx / S), Math.round(wy / S)));
	if (!c) return;
	const d = Math.hypot(wx - c.x * S, wy - c.y * S);
	return d <= R * 1.15 ? c : undefined;
}
window.addEventListener('pointermove', (e) => {
	if (drag) {
		const dx = e.clientX - drag.x;
		const dy = e.clientY - drag.y;
		if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
		if (drag.moved) {
			camera.x = drag.cx - dx / camera.scale;
			camera.y = drag.cy - dy / camera.scale;
			zoomName = null;
			applyCamera();
			drawGrid();
		}
		return;
	}
	if (e.target !== canvas) return;
	const c = cellAt(e);
	const hover = c && c.color !== EVIL && c.planned !== 'place' ? c.owner : null;
	if (hover !== state.hover && !state.focus) {
		state.hover = hover;
		build();
		updateCard();
	}
});
window.addEventListener('pointerup', (e) => {
	if (drag && !drag.moved && e.target === canvas) {
		const c = cellAt(e);
		state.focus = c && c.color !== EVIL && c.planned !== 'place' && state.focus !== c.owner ? c.owner : null;
		build();
		updateCard();
		syncURL();
	}
	if (drag?.moved) syncURL();
	drag = null;
});
canvas.addEventListener(
	'wheel',
	(e) => {
		e.preventDefault();
		const wx = (e.clientX - world.position.x) / camera.scale;
		const wy = (e.clientY - world.position.y) / camera.scale;
		camera.scale = Math.min(4, Math.max(0.12, camera.scale * Math.exp(-e.deltaY * 0.0015)));
		camera.x = wx - (e.clientX - app.screen.width / 2) / camera.scale;
		camera.y = wy - (e.clientY - app.screen.height / 2) / camera.scale;
		zoomName = null;
		onCamera();
		syncURL();
	},
	{passive: false},
);

function setVariant(v: Variant) {
	state.variant = v;
	state.links = v !== 'c' ? true : state.links;
	build();
	renderUI();
	syncURL();
}
window.addEventListener('keydown', (e) => {
	const i = VARIANTS.findIndex((v) => v.id === state.variant);
	if (e.key === 'ArrowRight') setVariant(VARIANTS[(i + 1) % 3].id);
	else if (e.key === 'ArrowLeft') setVariant(VARIANTS[(i + 2) % 3].id);
	else if (e.key === 't' || e.key === 'T') turn();
	else if (e.key === 'r' || e.key === 'R') reset();
	else if (e.key === 'b' || e.key === 'B') toggle('links');
	else if (e.key === 'o' || e.key === 'O') toggle('owners');
	else if (e.key === 'g' || e.key === 'G') toggle('outlines');
	else if (e.key === '1') preset('near');
	else if (e.key === '2') preset('mid');
	else if (e.key === '3') preset('far');
	else if (e.key === 'Escape') {
		state.focus = null;
		build();
		updateCard();
	}
	syncURL();
});
function toggle(k: 'links' | 'owners' | 'outlines') {
	state[k] = !state[k];
	build();
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
	const v = VARIANTS.find((x) => x.id === state.variant)!;
	$('variant-label').textContent = `${v.id.toUpperCase()} (${v.name})`;
	for (const k of ['links', 'owners', 'outlines'] as const) ($(k) as HTMLInputElement).checked = state[k];
	for (const x of VARIANTS) ($(`v-${x.id}`) as HTMLInputElement).checked = x.id === state.variant;
}
function short(a: string) {
	return a.slice(0, 6) + '...' + a.slice(-4);
}
function updateCard() {
	const owner = state.focus ?? state.hover;
	const card = $('card');
	if (!owner) {
		card.style.display = 'none';
		return;
	}
	const s = ownerSummary(state.board, owner);
	card.style.display = 'flex';
	card.innerHTML = `<img src="${blockieDataURL(owner)}" width="48" height="48" style="image-rendering:pixelated;border-radius:6px"/>
	<div><div class="addr">${short(owner)}${owner === ME ? ' <b>(you)</b>' : ''}</div>
	<div>${s.cells} cells, ${s.stake} gems at stake</div>
	<div class="sw">${s.colors.map((c) => `<span style="background:${COLOURS[c]}"></span>`).join('')}</div>
	<div class="hint">${state.focus ? 'pinned: tap again or Esc to clear' : 'hover: tap to pin'}</div></div>`;
}
function updateStatus() {
	const r = app.renderer as unknown as {name?: string; gl?: WebGL2RenderingContext};
	let gpu = '';
	const gl = r.gl;
	if (gl) {
		const ext = gl.getExtension('WEBGL_debug_renderer_info');
		gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
	}
	$('status').textContent = `${r.name ?? 'renderer'} ${gpu ? '(' + gpu + ')' : ''} | ${state.board.size} cells | ${spacingPx().toFixed(0)} px per intersection (${zoomClass})`;
	(window as unknown as {__proto: unknown}).__proto = {renderer: r.name, gpu, cells: state.board.size, zoomClass, fps: app.ticker.FPS};
}
for (const x of VARIANTS) $(`v-${x.id}`).addEventListener('change', () => setVariant(x.id));
for (const k of ['links', 'owners', 'outlines'] as const)
	$(k).addEventListener('change', () => {
		toggle(k);
		syncURL();
	});
$('turn').addEventListener('click', turn);
$('reset').addEventListener('click', reset);
$('prev').addEventListener('click', () => setVariant(VARIANTS[(VARIANTS.findIndex((v) => v.id === state.variant) + 2) % 3].id));
$('next').addEventListener('click', () => setVariant(VARIANTS[(VARIANTS.findIndex((v) => v.id === state.variant) + 1) % 3].id));
for (const z of ['near', 'mid', 'far']) $(`z-${z}`).addEventListener('click', () => (preset(z), syncURL()));

if (params.get('ui') === '0') $('controls').style.display = 'none';
$('hide').addEventListener('click', () => ($('controls').style.display = 'none'));
window.addEventListener('keydown', (e) => {
	if (e.key === 'h' || e.key === 'H') $('controls').style.display = $('controls').style.display === 'none' ? '' : 'none';
});
renderUI();
preset(zoomName ?? 'near');
if (params.get('cx')) {
	// an exact camera, for screenshots: cx, cy in cells, px per intersection
	Object.assign(camera, {x: Number(params.get('cx')) * S, y: Number(params.get('cy')) * S, scale: Number(params.get('px') ?? 100) / S});
	onCamera();
}
updateCard();
syncURL();
window.addEventListener('resize', () => onCamera());
(window as unknown as {__turn: () => void}).__turn = turn;

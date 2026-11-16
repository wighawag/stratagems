/**
 * THROWAWAY PROTOTYPE (branch proto/spirit-map). Stratagems as a low-poly map
 * of spirits on the sea, in three.js: the same information as the Go board
 * (colour, life 0-7, trend, friends and enemies, dead husks, Evil and its
 * stake, yours, planned placements and removals), as terrain.
 *
 * Two variants, switched by the bottom bar or `?variant=A|B`:
 *   A "Continent": one blended heightfield, territories merge, fronts are rifts.
 *   B "Diorama": a pillar of land per cell, bridges between friends.
 */
import * as THREE from 'three';
import {MapControls} from 'three/examples/jsm/controls/MapControls.js';
import {BIOMES, SEA, SKY} from './biomes';
import {ContinentTerrain} from './continent';
import {DioramaTerrain} from './diorama';
import {animateMaterials, Overlays, type Layers} from './overlays';
import {fxUniforms} from './fx';
import {Events, VOLLEY_S} from './events';
import {Grid, key, ME, nextBoard, pressureOf, type Board, type Plans} from './rules';
import {SCENES} from './scenes';
import {uniforms, type Terrain} from './terrain';

const params = new URLSearchParams(location.search);
const VARIANTS = [
	{key: 'A', name: 'Continent'},
	{key: 'B', name: 'Diorama'},
] as const;
type Variant = 'A' | 'B';

const state = {
	variant: (params.get('variant') === 'B' ? 'B' : 'A') as Variant,
	scene: params.get('scene') && SCENES[params.get('scene')!] ? params.get('scene')! : 'showcase',
	res: Number(params.get('res') ?? 3),
	free: params.get('free') === '1',
	shadows: params.get('shadows') !== '0',
	auto: false,
	mode: 'look' as 'look' | 'place' | 'remove',
	faction: 3,
	layers: {props: true, stones: true, spirits: true, fx: true, attacks: true, flags: true, ambient: true, plans: true} as Layers,
	/** Loop every animation everywhere (the first round), or play them once, at the turn and on the focused cell. */
	lively: params.get('lively') === '1',
	/** The map alone, for a game built on top: no spirits, stones, banners, fights or plans. */
	mapOnly: params.get('map') === '1',
	/** With the map alone: every living cell drawn alike, so life and stake do not show either. */
	uniform: params.get('uniform') === '1',
};

/* ---------- three ---------- */

const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot')});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = state.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY, 40, 120);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 2000);

scene.add(new THREE.HemisphereLight('#d6ecff', '#35523f', 1.1));
const sun = new THREE.DirectionalLight('#fff0d4', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// the sea: low-poly waves, see-through enough to show the shallows
const seaGeo = new THREE.PlaneGeometry(260, 260, 130, 130).rotateX(-Math.PI / 2);
const seaMat = new THREE.MeshStandardMaterial({color: SEA, transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0.05, flatShading: true});
seaMat.onBeforeCompile = (shader) => {
	shader.uniforms.uTime = uniforms.uTime;
	shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
		'#include <begin_vertex>',
		`#include <begin_vertex>
		vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
		transformed.y += 0.025 * sin(wp.x * 1.7 + uTime * 1.1) + 0.02 * sin(wp.z * 2.3 - uTime * 0.9) + 0.012 * sin((wp.x + wp.z) * 3.1 + uTime * 1.7);`,
	);
};
const sea = new THREE.Mesh(seaGeo, seaMat);
sea.receiveShadow = true;
sea.renderOrder = 1;
scene.add(sea);

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.screenSpacePanning = false;
controls.minDistance = 2.5;
controls.maxDistance = 320;
controls.zoomToCursor = true;

const FIXED_POLAR = 0.8;
function applyCamera() {
	controls.enableRotate = state.free;
	if (state.free) {
		controls.minPolarAngle = 0.05;
		controls.maxPolarAngle = 1.45;
		controls.minAzimuthAngle = -Infinity;
		controls.maxAzimuthAngle = Infinity;
		controls.touches = {ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE};
	} else {
		controls.minPolarAngle = controls.maxPolarAngle = FIXED_POLAR;
		controls.minAzimuthAngle = controls.maxAzimuthAngle = 0;
		controls.touches = {ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN};
	}
	controls.update();
}

function lookAt(x: number, z: number, dist: number) {
	controls.target.set(x, 0, z);
	camera.position.set(x, Math.cos(FIXED_POLAR) * dist, z + Math.sin(FIXED_POLAR) * dist);
	controls.update();
}

/* ---------- the world ---------- */

let board: Board = new Map();
let plans: Plans = new Map();
let grid = new Grid(board);
let terrain: Terrain = makeTerrain();
const overlays = new Overlays();
const events = new Events();
scene.add(terrain.group, overlays.group, events.group);

/** The board as drawn: with the map alone and uniform, every living cell at one life and one gem. */
function shown(b: Board): Board {
	if (!(state.mapOnly && state.uniform)) return b;
	const out: Board = new Map();
	for (const [k, c] of b) out.set(k, c.life > 0 ? {...c, life: 5, stake: 1} : c);
	return out;
}

function buildOverlays() {
	overlays.build(grid, plans, terrain, state.variant, {lively: state.lively});
}

function layersNow(): Layers {
	const L = state.layers;
	if (!state.mapOnly) return L;
	return {props: L.props, ambient: L.ambient, stones: false, spirits: false, fx: false, attacks: false, flags: false, plans: false};
}

function makeTerrain(): Terrain {
	return state.variant === 'A' ? new ContinentTerrain(state.res) : new DioramaTerrain();
}

let buildMs = 0;
function rebuild(prev?: Grid) {
	const t0 = performance.now();
	grid = new Grid(shown(board));
	terrain.build(grid, prev);
	if (!prev) buildOverlays();
	if (!prev) events.focus(undefined, board, terrain, state.variant);
	buildMs = performance.now() - t0;
}

function loadScene(name: string) {
	state.scene = name;
	const s = SCENES[name]();
	board = s.board;
	plans = s.plans;
	rebuild();
	lookAt(s.focus[0], s.focus[1], s.zoom);
	syncUrl();
	renderPanel();
}

function setVariant(v: Variant) {
	state.variant = v;
	scene.remove(terrain.group);
	terrain.dispose();
	terrain = makeTerrain();
	scene.add(terrain.group);
	rebuild();
	syncUrl();
	renderPanel();
}

let morph: {start: number; prev: Grid} | undefined;
const MORPH_MS = 1100;
function turn() {
	if (morph) return;
	const prev = grid;
	const fights = !state.mapOnly && state.layers.attacks && !state.lively;
	// first the volley, on the board as it was; then the land changes
	if (fights) events.volley(board, terrain, state.variant, uniforms.uTime.value);
	events.focus(undefined, board, terrain, state.variant);
	board = nextBoard(board, plans);
	plans = new Map();
	rebuild(prev);
	terrain.setMorph(0);
	morph = {start: performance.now() + (fights ? VOLLEY_S * 1000 : 0), prev};
}

/* ---------- interaction ---------- */

const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.15);
const ndc = new THREE.Vector2();
const card = document.getElementById('card')!;

function cellAt(ev: PointerEvent): [number, number] | undefined {
	ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
	ray.setFromCamera(ndc, camera);
	const p = new THREE.Vector3();
	if (!ray.ray.intersectPlane(ground, p)) return undefined;
	return [Math.round(p.x), Math.round(p.z)];
}

function setFocus(k: string | undefined) {
	events.focus(state.lively || state.mapOnly || !state.layers.attacks ? undefined : k, board, terrain, state.variant);
}

renderer.domElement.addEventListener('pointermove', (ev) => {
	if (ev.pointerType !== 'mouse' || ev.buttons) return;
	describe(ev);
});

/** The card and the focus for the cell under the pointer. */
function describe(ev: PointerEvent) {
	if (state.mapOnly) {
		card.style.display = 'none';
		setFocus(undefined);
		return;
	}
	const at = cellAt(ev);
	setFocus(at && board.has(key(at[0], at[1])) ? key(at[0], at[1]) : undefined);
	const c = at && board.get(key(at[0], at[1]));
	const plan = at && plans.get(key(at[0], at[1]));
	if (!at || (!c && plan === undefined)) {
		card.style.display = 'none';
		return;
	}
	const lines: string[] = [];
	if (c) {
		const b = BIOMES[c.color];
		const p = pressureOf(board, c);
		lines.push(
			`${b.name} (${b.faction})  ${at[0]},${at[1]}`,
			`life ${c.life}/7  ${p.trend}`,
			`friends ${p.friends}  enemies ${p.enemies}`,
			c.color === 6 ? `stake ${c.stake} gems (${c.stake} plumes)` : `stake ${c.stake}`,
			c.owner === ME ? 'yours' : `owner ${c.owner}`,
		);
	}
	if (plan !== undefined) lines.push(plan === 0 ? 'planned: removal' : `planned: ${BIOMES[plan].name}`);
	card.textContent = lines.join('\n');
	card.style.display = 'block';
	card.style.left = ev.clientX + 14 + 'px';
	card.style.top = ev.clientY + 14 + 'px';
}

let down: {x: number; y: number} | undefined;
renderer.domElement.addEventListener('pointerdown', (ev) => (down = {x: ev.clientX, y: ev.clientY}));
renderer.domElement.addEventListener('pointerup', (ev) => {
	if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) return;
	if (state.mode === 'look') {
		// a tap (no hover on a phone) focuses the cell
		if (ev.pointerType !== 'mouse') describe(ev);
		return;
	}
	const at = cellAt(ev);
	if (!at) return;
	const k = key(at[0], at[1]);
	const c = board.get(k);
	if (plans.has(k)) plans.delete(k);
	else if (state.mode === 'place' && (!c || c.life === 0)) plans.set(k, state.faction);
	else if (state.mode === 'remove' && c) plans.set(k, 0);
	else return;
	buildOverlays();
});

addEventListener('keydown', (ev) => {
	if ((ev.target as HTMLElement).closest?.('input,textarea,select,[contenteditable]')) return;
	if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
		const i = VARIANTS.findIndex((v) => v.key === state.variant);
		const n = VARIANTS[(i + (ev.key === 'ArrowRight' ? 1 : VARIANTS.length - 1)) % VARIANTS.length];
		setVariant(n.key);
	} else if (ev.key === 't' || ev.key === 'T') turn();
	else if (ev.key === 'f' || ev.key === 'F') {
		state.free = !state.free;
		applyCamera();
		renderPanel();
	}
});

/* ---------- panel ---------- */

const panel = document.getElementById('panel')!;
let statsEl: HTMLElement | undefined;

function syncUrl() {
	const p = new URLSearchParams(location.search);
	p.set('variant', state.variant);
	p.set('scene', state.scene);
	for (const [k, v] of [
		['lively', state.lively],
		['map', state.mapOnly],
		['uniform', state.uniform],
	] as const)
		if (v) p.set(k, '1');
		else p.delete(k);
	history.replaceState(null, '', '?' + p.toString());
	const v = VARIANTS.find((v) => v.key === state.variant)!;
	document.getElementById('vlabel')!.textContent = `${v.key} (${v.name})`;
}

function renderPanel() {
	const closed = panel.classList.contains('closed');
	const L = state.layers;
	const tog = (k: keyof Layers, label: string) => `<button data-layer="${k}" class="${L[k] ? 'on' : ''}">${label}</button>`;
	panel.innerHTML = `
	<div class="head" id="ph"><span>Spirit map (prototype)</span><span>${closed ? '+' : '-'}</span></div>
	<label>Scene <select id="scene">${Object.keys(SCENES)
		.map((s) => `<option ${s === state.scene ? 'selected' : ''}>${s}</option>`)
		.join('')}</select></label>
	${state.variant === 'A' ? `<label>Detail <select id="res">${[2, 3, 4].map((r) => `<option value="${r}" ${r === state.res ? 'selected' : ''}>${r} per cell</option>`).join('')}</select></label>` : ''}
	<div class="row">${tog('props', 'props')}${tog('stones', 'stones')}${tog('spirits', 'spirits')}${tog('fx', 'motes')}${tog('attacks', 'attacks')}${tog('flags', 'banners')}</div>
	<div class="row">
		<button id="turn">Turn (T)</button>
		<button id="auto" class="${state.auto ? 'on' : ''}">auto</button>
		<button id="free" class="${state.free ? 'on' : ''}">free cam (F)</button>
		<button id="shadows" class="${state.shadows ? 'on' : ''}">shadows</button>
	</div>
	<div class="row">
		<button id="lively" class="${state.lively ? 'on' : ''}" title="loop every animation everywhere, or play them once at the turn and on the focused cell">${state.lively ? 'lively' : 'calm'}</button>
		<button id="mapOnly" class="${state.mapOnly ? 'on' : ''}" title="the map alone, for a game on top">map only</button>
		${state.mapOnly ? `<button id="uniform" class="${state.uniform ? 'on' : ''}" title="every living cell alike: no life, no stake">hide life</button>` : ''}
	</div>
	<div class="row">
		${(['look', 'place', 'remove'] as const).map((m) => `<button data-mode="${m}" class="${state.mode === m ? 'on' : ''}">${m}</button>`).join('')}
		<select id="faction">${[1, 2, 3, 4, 5].map((f) => `<option value="${f}" ${f === state.faction ? 'selected' : ''}>${BIOMES[f].name}</option>`).join('')}</select>
	</div>
	<div class="stats" id="stats"></div>
	<details class="legend"><summary>legend</summary>
		Glacier=Blue, Mesa=Red, Forest=Green, Plains=Yellow, Mountains=Purple, Volcano=Evil.<br>
		Life: props and height far away; close up, the ring of 7 stones (gold lit, pulsing gold = coming, pulsing red = going).<br>
		Attacks: calm plays one volley at each turn (bolts from each living spirit to every enemy edge), then motes where life came, embers where it went; hover or tap a cell to see its fights. Lively loops it all everywhere. Dead: grey husk, still counts.<br>
		Map only: the land alone, for a game on top; hide life draws every living cell alike.<br>
		Volcano: one smoke plume per gem at stake. Yours: a banner. Ghost = planned, red X = removal.<br>
		Drag to pan, wheel or pinch to zoom, T for a turn, place/remove then click a cell.
	</details>`;
	statsEl = document.getElementById('stats')!;
	document.getElementById('ph')!.onclick = () => {
		panel.classList.toggle('closed');
		renderPanel();
	};
	(document.getElementById('scene') as HTMLSelectElement).onchange = (e) => loadScene((e.target as HTMLSelectElement).value);
	const res = document.getElementById('res') as HTMLSelectElement | null;
	if (res)
		res.onchange = () => {
			state.res = Number(res.value);
			setVariant('A');
		};
	panel.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach(
		(b) =>
			(b.onclick = () => {
				const k = b.dataset.layer as keyof Layers;
				L[k] = !L[k];
				renderPanel();
			}),
	);
	panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(
		(b) =>
			(b.onclick = () => {
				state.mode = b.dataset.mode as typeof state.mode;
				renderPanel();
			}),
	);
	(document.getElementById('faction') as HTMLSelectElement).onchange = (e) => (state.faction = Number((e.target as HTMLSelectElement).value));
	document.getElementById('turn')!.onclick = turn;
	document.getElementById('auto')!.onclick = () => {
		state.auto = !state.auto;
		renderPanel();
	};
	document.getElementById('free')!.onclick = () => {
		state.free = !state.free;
		applyCamera();
		renderPanel();
	};
	document.getElementById('lively')!.onclick = () => {
		state.lively = !state.lively;
		buildOverlays();
		setFocus(undefined);
		syncUrl();
		renderPanel();
	};
	document.getElementById('mapOnly')!.onclick = () => {
		state.mapOnly = !state.mapOnly;
		card.style.display = 'none';
		setFocus(undefined);
		rebuild();
		syncUrl();
		renderPanel();
	};
	const uni = document.getElementById('uniform');
	if (uni)
		uni.onclick = () => {
			state.uniform = !state.uniform;
			rebuild();
			syncUrl();
			renderPanel();
		};
	document.getElementById('shadows')!.onclick = () => {
		state.shadows = !state.shadows;
		renderer.shadowMap.enabled = state.shadows;
		scene.traverse((o) => {
			if ((o as THREE.Mesh).material) ((o as THREE.Mesh).material as THREE.Material).needsUpdate = true;
		});
		renderPanel();
	};
}

document.getElementById('prev')!.onclick = () => setVariant(state.variant === 'A' ? 'B' : 'A');
document.getElementById('next')!.onclick = () => setVariant(state.variant === 'A' ? 'B' : 'A');

/* ---------- loop ---------- */

function resize() {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
	fxUniforms.uScale.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
addEventListener('resize', resize);
resize();

let frames = 0,
	lastStats = performance.now(),
	fps = 0,
	lastAuto = performance.now();
const clock = new THREE.Clock();

function frame() {
	const now = performance.now();
	const t = clock.getElapsedTime();
	uniforms.uTime.value = t;
	animateMaterials(t);
	controls.update();

	if (morph) {
		const p = Math.min(1, (now - morph.start) / MORPH_MS);
		terrain.setMorph(1 - (1 - p) ** 3);
		if (p >= 1) {
			const prev = morph.prev;
			morph = undefined;
			buildOverlays();
			if (!state.lively && !state.mapOnly && state.layers.fx) events.changes(prev, grid, terrain, uniforms.uTime.value);
		}
	}
	if (state.auto && !morph && now - lastAuto > 2600) {
		lastAuto = now;
		turn();
	}

	const tgt = controls.target;
	const dist = camera.position.distanceTo(tgt);
	const s = Math.max(1, dist / 55);
	sea.scale.set(s, 1, s);
	sea.position.set(Math.round(tgt.x / (2 * s)) * 2 * s, 0, Math.round(tgt.z / (2 * s)) * 2 * s);
	const fog = scene.fog as THREE.Fog;
	fog.near = dist * 1.4;
	fog.far = dist * 4 + 20;

	const ext = THREE.MathUtils.clamp(dist * 0.75, 6, 45);
	sun.position.set(tgt.x - ext * 0.6, ext * 1.4 + 6, tgt.z - ext * 0.3);
	sun.target.position.copy(tgt);
	const sc = sun.shadow.camera;
	sc.left = sc.bottom = -ext;
	sc.right = sc.top = ext;
	sc.near = 0.5;
	sc.far = ext * 4 + 20;
	sc.updateProjectionMatrix();

	overlays.update(camera, layersNow());
	events.update(t);
	events.group.visible = dist < 60;
	renderer.render(scene, camera);

	frames++;
	if (now - lastStats > 500) {
		fps = (frames * 1000) / (now - lastStats);
		frames = 0;
		lastStats = now;
		if (statsEl) {
			const info = renderer.info.render;
			statsEl.textContent = `${fps.toFixed(0)} fps  ${board.size} cells\n${(info.triangles / 1000).toFixed(0)}k tris  ${info.calls} calls\nbuild ${buildMs.toFixed(0)} ms  dist ${dist.toFixed(0)}`;
		}
	}
	requestAnimationFrame(frame);
}

if (innerWidth < 700) panel.classList.add('closed');
applyCamera();
renderPanel();
loadScene(state.scene);
if (params.has('x')) lookAt(Number(params.get('x')), Number(params.get('z')), Number(params.get('d') ?? 20));
if (params.has('az') || params.has('polar')) {
	state.free = true;
	applyCamera();
	const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
	sph.theta = Number(params.get('az') ?? 0);
	sph.phi = Number(params.get('polar') ?? FIXED_POLAR);
	camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph));
	controls.update();
}
if (params.has('turns')) for (let i = 0; i < Number(params.get('turns')); i++) {
	board = nextBoard(board, plans);
	plans = new Map();
	rebuild();
}
(window as unknown as {ready: boolean}).ready = true;
frame();

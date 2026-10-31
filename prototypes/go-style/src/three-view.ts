/**
 * THROWAWAY PROTOTYPE, round 3. The "three" look, taken seriously: a
 * perspective camera that tilts and turns, real shadows, a key light low
 * enough to model the domes and a cool rim light behind them, gems with
 * volume (a taller cabochon), and each gem style as its own material. Every
 * kind of thing is one InstancedMesh. No turn animation (it snaps).
 */
import * as THREE from 'three';
import {type Board, type Cell, EVIL, linksOf, key, pressureOf} from './rules';
import {environment, foilMaterial} from './bake';
import {type BoardKind, type GemStyle, type MineMark, boardCanvas, gemColour, lineColour} from './style';
import {ME} from './scenes';

const S = 64;
const R = 0.38 * S;
/** Dome height, of the radius; the table's radius. */
const H = 0.62;
const TABLE = 0.4;

export type ThreeParams = {
	board: Board;
	sized: boolean;
	dial: boolean;
	links: boolean;
	outlines: boolean;
	focus: string | null;
	sizeOf: (life: number) => number;
	style: GemStyle;
	boardKind: BoardKind;
	mine: MineMark;
};

/** The dome's height at radius r (0..1), girdle 0.1. */
function domeAt(r: number): number {
	if (r <= TABLE) return H;
	const u = (r - TABLE) / (1 - TABLE);
	return 0.1 + (H - 0.1) * Math.cos((u * Math.PI) / 2) ** 0.7;
}
function gemGeometry(): THREE.BufferGeometry {
	const pts = [new THREE.Vector2(0, H), new THREE.Vector2(TABLE, H)];
	for (let i = 1; i <= 20; i++) {
		const r = TABLE + ((1 - TABLE) * i) / 20;
		pts.push(new THREE.Vector2(r, domeAt(r)));
	}
	pts.push(new THREE.Vector2(1, 0), new THREE.Vector2(0.001, 0));
	// LatheGeometry wants the profile from the bottom up for outward faces (top-down, as round 2 had it, every face pointed in)
	pts.reverse();
	const g = new THREE.LatheGeometry(pts, 64);
	g.rotateX(Math.PI / 2);
	g.computeVertexNormals();
	return g;
}

function gemMaterial(color: number, style: GemStyle): THREE.MeshPhysicalMaterial {
	const c = new THREE.Color(gemColour(color, style));
	const evil = color === EVIL;
	if (style === 'yunzi')
		return new THREE.MeshPhysicalMaterial({color: c, roughness: 0.34, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.5), sheenRoughness: 0.6});
	if (style === 'lacquer') return new THREE.MeshPhysicalMaterial({color: c, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04});
	if (evil) return new THREE.MeshPhysicalMaterial({color: c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1});
	return new THREE.MeshPhysicalMaterial({color: c, roughness: 0.04, transmission: 0.4, thickness: 0.9, ior: 1.6, attenuationColor: c, attenuationDistance: 0.3, clearcoat: 1, clearcoatRoughness: 0.02});
}

export function createThreeView(container: HTMLElement) {
	const renderer = new THREE.WebGLRenderer({antialias: true});
	renderer.setPixelRatio(window.devicePixelRatio || 1);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.domElement.style.cssText = 'position:fixed;inset:0;display:none';
	container.prepend(renderer.domElement);
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x15100b);
	scene.environment = environment(renderer);
	scene.environmentIntensity = 0.55;
	scene.environmentRotation.set(Math.PI / 2, 0, 0.6);
	// a warm key light low from the upper left, a cool rim light from behind, a soft fill
	const keyLight = new THREE.DirectionalLight(0xfff0dc, 2.2);
	keyLight.castShadow = true;
	keyLight.shadow.mapSize.set(2048, 2048);
	keyLight.shadow.bias = -0.0004;
	keyLight.shadow.normalBias = 0.6;
	keyLight.shadow.radius = 4;
	scene.add(keyLight, keyLight.target);
	const rim = new THREE.DirectionalLight(0xbfd4ff, 0.9);
	scene.add(rim, rim.target);
	scene.add(new THREE.HemisphereLight(0xfff6e8, 0x3a2a18, 0.35));

	let boardKind: BoardKind | null = null;
	const boardMat = new THREE.MeshStandardMaterial({roughness: 0.6, metalness: 0});
	const BIG = 1024 * 64;
	const board = new THREE.Mesh(new THREE.PlaneGeometry(BIG, BIG), boardMat);
	board.receiveShadow = true;
	scene.add(board);
	function setBoard(kind: BoardKind) {
		if (kind === boardKind) return;
		boardKind = kind;
		const tile = boardCanvas(kind, 1024);
		const ctx = tile.getContext('2d')!;
		ctx.strokeStyle = lineColour(kind).css;
		ctx.lineWidth = 2.4;
		for (let i = 0; i <= 16; i++) {
			const p = i * 64;
			ctx.beginPath();
			ctx.moveTo(p, 0);
			ctx.lineTo(p, 1024);
			ctx.moveTo(0, p);
			ctx.lineTo(1024, p);
			ctx.stroke();
		}
		ctx.fillStyle = lineColour(kind).css;
		for (const x of [0, 512, 1024]) for (const y of [0, 512, 1024]) ctx.beginPath(), ctx.arc(x, y, 7, 0, Math.PI * 2), ctx.fill();
		boardMat.map?.dispose();
		const t = new THREE.CanvasTexture(tile);
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.repeat.set(BIG / 1024, BIG / 1024);
		t.offset.set(0.5, 0.5);
		t.colorSpace = THREE.SRGBColorSpace;
		t.anisotropy = renderer.capabilities.getMaxAnisotropy();
		boardMat.map = t;
		boardMat.roughness = kind === 'slate' ? 0.45 : kind === 'felt' ? 0.95 : kind === 'washi' ? 0.85 : 0.55;
		boardMat.needsUpdate = true;
	}

	const gemGeo = gemGeometry();
	const foilGeo = new THREE.CircleGeometry(0.9, 48);
	const discGeo = new THREE.CylinderGeometry(1, 1, 1, 48).rotateX(Math.PI / 2);
	const pipGeo = new THREE.SphereGeometry(1, 14, 10);
	const torusGeo = new THREE.TorusGeometry(1, 0.07, 10, 64);
	const goldRimGeo = new THREE.TorusGeometry(1, 0.035, 8, 64);
	const bezelGeo = new THREE.TorusGeometry(1, 0.13, 14, 64);
	const boxGeo = new THREE.BoxGeometry(1, 1, 1);
	const tileGeo = new THREE.BoxGeometry(1, 1, 1);
	const prismGeo = new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(Math.PI / 2);

	const gold = new THREE.MeshPhysicalMaterial({color: 0xe0b24a, metalness: 1, roughness: 0.22, clearcoat: 0.5});
	const pendingGrow = new THREE.MeshStandardMaterial({color: 0xfff1b0, emissive: 0xffd76a, emissiveIntensity: 1});
	const pendingShrink = new THREE.MeshStandardMaterial({color: 0xff3a2a, emissive: 0xff1a10, emissiveIntensity: 1});
	const mats = new Map<string, THREE.Material>();
	function mat(id: string, make: () => THREE.Material, dim: boolean): THREE.Material {
		const k = id + (dim ? ':dim' : '');
		let m = mats.get(k);
		if (!m) {
			m = make();
			if (dim) {
				m.transparent = true;
				m.opacity = 0.16;
				m.depthWrite = false;
				if (m instanceof THREE.MeshPhysicalMaterial) m.transmission = 0;
			}
			mats.set(k, m);
		}
		return m;
	}

	let content = new THREE.Group();
	scene.add(content);
	const m4 = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) =>
		new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz));

	function build(p: ThreeParams) {
		setBoard(p.boardKind);
		scene.remove(content);
		content.traverse((o) => o instanceof THREE.InstancedMesh && o.dispose());
		content = new THREE.Group();
		scene.add(content);
		const groups = new Map<string, {geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[]; shadow: boolean}>();
		const add = (id: string, geo: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4, shadow = true) => {
			const g = groups.get(id) ?? groups.set(id, {geo, mat: material, m: [], shadow}).get(id)!;
			g.m.push(matrix);
		};
		const style = p.style;
		const scaleOf = (c: Cell) => (c.life === 0 ? (p.sized ? 0.62 : 0.9) : p.sized ? p.sizeOf(c.life) : 1);
		for (const cell of p.board.values()) {
			const dim = !!p.focus && cell.owner !== p.focus && !(p.focus === '0xffffffffffffffffffffffffffffffffffffffff' && cell.color === EVIL);
			const X = cell.x * S;
			const Y = -cell.y * S;
			const evil = cell.color === EVIL;
			const s = scaleOf(cell) * R;
			const ghost = cell.planned === 'place';
			const C = cell.color;
			if (cell.life === 0 && !ghost) {
				add(`husk${C}${dim}`, discGeo, mat(`husk${C}`, () => new THREE.MeshStandardMaterial({color: new THREE.Color(gemColour(C, style)).lerp(new THREE.Color(0x77706a), 0.65), roughness: 0.95}), dim), m4(X, Y, 1.2, s * 0.92, s * 0.92, 2.4));
				continue;
			}
			let z0 = 0;
			const mine = cell.owner === ME && !ghost;
			if (mine && p.mine === 'tile') {
				const th = R * 0.22;
				add('tile' + dim, tileGeo, mat('tile', () => new THREE.MeshPhysicalMaterial({color: 0xf6efe0, roughness: 0.3, clearcoat: 0.6}), dim), m4(X, Y, th / 2, R * 2.5, R * 2.5, th));
				z0 = th;
			}
			if (mine && p.mine === 'halo') {
				add('haloDark' + dim, torusGeo, mat('haloDark', () => new THREE.MeshStandardMaterial({color: 0x101010, roughness: 0.5}), dim), m4(X, Y, 0.5, R * 1.3, R * 1.3, R * 1.6));
				add('halo' + dim, torusGeo, mat('halo', () => new THREE.MeshPhysicalMaterial({color: 0xfbf6ea, roughness: 0.25, clearcoat: 1, emissive: 0x333028}), dim), m4(X, Y, 1.4, R * 1.3, R * 1.3, R * 1.2));
			}
			// the stack: a disc per gem under the top one
			const discH = R * 0.22;
			for (let g = 0; g < cell.stake - 1; g++) add(`disc${C}${dim}`, discGeo, mat(`disc${C}:${style}`, () => gemMaterial(C, style === 'jewel' ? 'lacquer' : style), dim), m4(X, Y, z0 + discH * (g + 0.5), s, s, discH * 0.94));
			z0 += discH * (cell.stake - 1);
			if (ghost) {
				add(`ghost${C}`, gemGeo, mat(`ghost${C}:${style}`, () => new THREE.MeshStandardMaterial({color: gemColour(C, style), transparent: true, opacity: 0.4, depthWrite: false}), false), m4(X, Y, z0, s, s, s), false);
				continue;
			}
			add(`gem${C}${dim}`, gemGeo, mat(`gem${C}:${style}`, () => gemMaterial(C, style), dim), m4(X, Y, z0, s, s, s));
			if (style === 'jewel' && !evil) add(`foil${C}${dim}`, foilGeo, mat(`foil${C}`, () => foilMaterial(gemColour(C, style)), dim), m4(X, Y, z0 + 0.5, s, s, 1), false);
			if (style === 'lacquer') {
				add('goldrim' + dim, goldRimGeo, dim ? mat('gold', () => gold.clone(), true) : gold, m4(X, Y, z0 + s * 0.12, s, s, s), false);
				add('goldtable' + dim, goldRimGeo, dim ? mat('gold', () => gold.clone(), true) : gold, m4(X, Y, z0 + s * H, s * TABLE, s * TABLE, s * 0.5), false);
			}
			if (mine && p.mine === 'bezel') {
				add('bezel' + dim, bezelGeo, dim ? mat('gold', () => gold.clone(), true) : gold, m4(X, Y, z0 + s * 0.12, s * 1.08, s * 1.08, s * 1.2));
				for (let i = 0; i < 4; i++) {
					const a = Math.PI / 4 + (i * Math.PI) / 2;
					add('prong' + dim, pipGeo, dim ? mat('gold', () => gold.clone(), true) : gold, m4(X + Math.cos(a) * s * 1.0, Y + Math.sin(a) * s * 1.0, z0 + s * 0.28, s * 0.14, s * 0.14, s * 0.2));
				}
			}
			const {trend} = pressureOf(p.board, cell);
			if (trend === 'shrink') add('rim' + dim, torusGeo, mat('rim', () => new THREE.MeshStandardMaterial({color: 0xd01c14, emissive: 0x8a0a05, emissiveIntensity: 0.9}), dim), m4(X, Y, z0 + s * 0.1, s * 1.0, s * 1.0, s), false);
			if (trend === 'grow' && p.sized) add('glow' + dim, torusGeo, mat('glow', () => new THREE.MeshStandardMaterial({color: 0xfff0c0, emissive: 0xffe08a, emissiveIntensity: 0.9}), dim), m4(X, Y, z0 + s * 0.1, s * 1.1, s * 1.1, s * 0.6), false);
			if (p.dial) {
				const filled = trend === 'shrink' ? cell.life - 1 : cell.life;
				const ring = 0.72;
				const h = domeAt(ring) * s;
				const pipKind = style === 'lacquer' ? 'gold' : evil ? 'bone' : 'ink';
				for (let i = 0; i < 7; i++) {
					const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
					const px = X + Math.cos(a) * s * ring;
					const py = Y - Math.sin(a) * s * ring;
					const pending = (trend === 'grow' && i === cell.life) || (trend === 'shrink' && i === cell.life - 1);
					if (pending) add('pending' + trend + dim, pipGeo, trend === 'grow' ? pendingGrow : pendingShrink, m4(px, py, z0 + h, s * 0.13, s * 0.13, s * 0.1), false);
					else if (i < filled)
						add('pip' + pipKind + dim, pipGeo, pipKind === 'gold' ? gold : mat('pip' + pipKind, () => new THREE.MeshStandardMaterial({color: pipKind === 'bone' ? 0xefe6d2 : 0x1d130a, roughness: 0.4}), dim), m4(px, py, z0 + h, s * 0.11, s * 0.11, s * 0.07), false);
					else add('hole' + dim, pipGeo, mat('hole', () => new THREE.MeshStandardMaterial({color: 0x000000, transparent: true, opacity: 0.35}), dim), m4(px, py, z0 + h - 0.6, s * 0.06, s * 0.06, s * 0.02), false);
				}
			}
			if (cell.planned === 'remove')
				for (const r of [Math.PI / 4, -Math.PI / 4]) add('cross', boxGeo, mat('cross', () => new THREE.MeshStandardMaterial({color: 0xb0141a, emissive: 0x500000}), false), m4(X, Y, z0 + s * H + 2, s * 1.3, s * 0.15, 3, r), false);
		}
		if (p.links) {
			for (const l of linksOf(p.board)) {
				const a = p.board.get(key(l.ax, l.ay))!;
				const b = p.board.get(key(l.bx, l.by))!;
				const ra = R * 0.85 * scaleOf(a);
				const rb = R * 0.85 * scaleOf(b);
				const horiz = l.ay === l.by;
				const dimL = !!p.focus && (l.kind === 'bridge' ? !(a.owner === p.focus && b.owner === p.focus) : a.owner !== p.focus && b.owner !== p.focus);
				if (l.kind === 'bridge') {
					const len = S - ra - rb;
					const cx = horiz ? l.ax * S + ra + len / 2 : l.ax * S;
					const cy = horiz ? -l.ay * S : -(l.ay * S + ra + len / 2);
					add(`bridge${a.color}${dimL}`, boxGeo, mat(`bridge${a.color}:${style}`, () => gemMaterial(a.color, style === 'jewel' ? 'lacquer' : style), dimL), m4(cx, cy, 3.5, horiz ? len : S * 0.22, horiz ? S * 0.22 : len, 7));
				} else {
					const mx = ((l.ax + l.bx) * S) / 2;
					const my = (-(l.ay + l.by) * S) / 2;
					const h = S * 0.16;
					for (const sgn of [1, -1]) {
						const [px, py, rot] = horiz ? [mx, my + sgn * h, sgn > 0 ? -Math.PI / 2 : Math.PI / 2] : [mx + sgn * h, my, sgn > 0 ? Math.PI : 0];
						add('notch' + dimL, prismGeo, mat('notch', () => new THREE.MeshStandardMaterial({color: 0xc0151c, emissive: 0x400000, roughness: 0.4}), dimL), m4(px, py, 4, S * 0.09, S * 0.09, 8, rot));
					}
					add('notchline' + dimL, boxGeo, mat('notch', () => new THREE.MeshStandardMaterial({color: 0xc0151c}), dimL), m4(mx, my, 1, horiz ? S * 0.5 : 3, horiz ? 3 : S * 0.5, 1), false);
				}
			}
		}
		for (const g of groups.values()) {
			const im = new THREE.InstancedMesh(g.geo, g.mat, g.m.length);
			g.m.forEach((m, i) => im.setMatrixAt(i, m));
			im.instanceMatrix.needsUpdate = true;
			im.frustumCulled = false;
			im.castShadow = g.shadow;
			content.add(im);
		}
	}

	const camera = new THREE.PerspectiveCamera(30, 1, 10, 200000);
	const ray = new THREE.Raycaster();
	function setCamera(c: {x: number; y: number; scale: number}, w: number, h: number, tiltDeg: number, azimuthDeg = 0) {
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		const tilt = (tiltDeg * Math.PI) / 180;
		const az = (azimuthDeg * Math.PI) / 180;
		// the distance at which `scale` px per world unit holds at the target
		const d = h / (2 * Math.tan((camera.fov * Math.PI) / 360) * c.scale);
		const off = new THREE.Vector3(0, -Math.sin(tilt) * d, Math.cos(tilt) * d).applyAxisAngle(new THREE.Vector3(0, 0, 1), az);
		const target = new THREE.Vector3(c.x, -c.y, 0);
		camera.position.copy(target).add(off);
		camera.up.set(-Math.sin(az), Math.cos(az), 0);
		camera.lookAt(target);
		camera.near = d * 0.05;
		camera.far = d * 20;
		camera.updateProjectionMatrix();
		// the key light and its shadow follow the view
		const extent = (Math.max(w, h) / c.scale) * 0.9;
		keyLight.position.copy(target).add(new THREE.Vector3(-0.55, 0.45, 0.7).normalize().multiplyScalar(extent * 2));
		keyLight.target.position.copy(target);
		const sc = keyLight.shadow.camera as THREE.OrthographicCamera;
		sc.left = -extent;
		sc.right = extent;
		sc.top = extent;
		sc.bottom = -extent;
		sc.near = 1;
		sc.far = extent * 5;
		sc.updateProjectionMatrix();
		keyLight.shadow.normalBias = Math.max(0.3, 0.4 / c.scale);
		rim.position.copy(target).add(new THREE.Vector3(0.3, 0.9, 0.35).normalize().multiplyScalar(extent * 2));
		rim.target.position.copy(target);
	}
	function screenToWorld(sx: number, sy: number, w: number, h: number, atZ = 0): {x: number; y: number} | undefined {
		ray.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), camera);
		const hit = new THREE.Vector3();
		if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -atZ), hit)) return;
		return {x: hit.x, y: -hit.y};
	}
	function frame(t: number) {
		const k = 0.5 + 0.5 * Math.sin(t * 4);
		pendingGrow.emissiveIntensity = 0.3 + 2.2 * k;
		pendingShrink.emissiveIntensity = 0.3 + 2.2 * k;
		renderer.render(scene, camera);
	}
	return {canvas: renderer.domElement, build, setCamera, screenToWorld, frame, info: () => renderer.info.render, gemHeight: R * H};
}

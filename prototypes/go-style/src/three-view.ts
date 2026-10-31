/**
 * THROWAWAY PROTOTYPE. The "three" look: the same board as live 3D, with
 * physically based gems (foil-backed cabochons with transmission and a clear
 * coat) on a wood board, every kind of thing one InstancedMesh, and an
 * optional tilt. No turn animation here (it snaps): the question is the look.
 */
import * as THREE from 'three';
import {type Board, type Cell, EVIL, MAX_LIFE, factionOutlines, key, linksOf, pressureOf} from './rules';
import {cabochonGeometry, environment, foilMaterial, gemMaterial} from './bake';
import {jewel, woodCanvas} from './textures';
import {ME} from './scenes';

const S = 64;
const R = 0.38 * S;

export type ThreeParams = {
	board: Board;
	sized: boolean;
	dial: boolean;
	links: boolean;
	outlines: boolean;
	focus: string | null;
	sizeOf: (life: number) => number;
};

export function createThreeView(container: HTMLElement) {
	const renderer = new THREE.WebGLRenderer({antialias: true});
	renderer.setPixelRatio(window.devicePixelRatio || 1);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.9;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.domElement.style.cssText = 'position:fixed;inset:0;display:none';
	container.prepend(renderer.domElement);
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x1b130b);
	scene.environment = environment(renderer);
	scene.environmentIntensity = 0.7;
	// the room is Y-up and the board Z-up: turn it so its lights hang above the board and show in the gems
	scene.environmentRotation.set(Math.PI / 2, 0, 0.6);
	const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
	sun.position.set(-300, 400, 900);
	scene.add(sun);
	scene.add(new THREE.AmbientLight(0xffffff, 0.15));

	// the board: one plane, the wood and the grid in its texture, hoshi every 8
	const tile = woodCanvas(1024);
	{
		const ctx = tile.getContext('2d')!;
		ctx.strokeStyle = 'rgba(36,19,8,0.8)';
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
		ctx.fillStyle = 'rgba(36,19,8,0.9)';
		for (const [x, y] of [
			[0, 0], [512, 0], [1024, 0], [0, 512], [512, 512], [1024, 512], [0, 1024], [512, 1024], [1024, 1024],
		]) {
			ctx.beginPath();
			ctx.arc(x, y, 7, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	const BIG = 1024 * 64;
	const woodTex = new THREE.CanvasTexture(tile);
	woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
	woodTex.repeat.set(BIG / 1024, BIG / 1024);
	woodTex.offset.set(0.5, 0.5); // the plane's centre on a tile corner: lines at multiples of 64
	woodTex.colorSpace = THREE.SRGBColorSpace;
	woodTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
	const board = new THREE.Mesh(new THREE.PlaneGeometry(BIG, BIG), new THREE.MeshStandardMaterial({map: woodTex, roughness: 0.55, metalness: 0}));
	board.position.set(0, 0, 0); // lines through the cell centres (stones sit on intersections)
	scene.add(board);

	const shadowTex = (() => {
		const c = document.createElement('canvas');
		c.width = c.height = 64;
		const g = c.getContext('2d')!;
		const r = g.createRadialGradient(32, 32, 10, 32, 32, 32);
		r.addColorStop(0, 'rgba(0,0,0,0.55)');
		r.addColorStop(1, 'rgba(0,0,0,0)');
		g.fillStyle = r;
		g.fillRect(0, 0, 64, 64);
		return new THREE.CanvasTexture(c);
	})();

	const gemGeo = cabochonGeometry(48);
	const foilGeo = new THREE.CircleGeometry(0.93, 48);
	const discGeo = new THREE.CylinderGeometry(1, 1, 1, 48).rotateX(Math.PI / 2);
	const pipGeo = new THREE.SphereGeometry(1, 12, 8);
	const torusGeo = new THREE.TorusGeometry(1, 0.07, 8, 64);
	const bezelGeo = new THREE.TorusGeometry(1, 0.11, 12, 64);
	const boxGeo = new THREE.BoxGeometry(1, 1, 1);
	const prismGeo = new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(Math.PI / 2);
	const planeGeo = new THREE.PlaneGeometry(1, 1);

	const mats = new Map<string, THREE.Material>();
	function mat(id: string, make: () => THREE.Material, dim: boolean): THREE.Material {
		const k = id + (dim ? ':dim' : '');
		let m = mats.get(k);
		if (!m) {
			m = make();
			if (dim) {
				m.transparent = true;
				m.opacity = 0.18;
				m.depthWrite = false;
				if (m instanceof THREE.MeshPhysicalMaterial) m.transmission = 0;
			}
			mats.set(k, m);
		}
		return m;
	}
	const pendingGrow = new THREE.MeshStandardMaterial({color: 0xfff1b0, emissive: 0xffd76a, emissiveIntensity: 1});
	const pendingShrink = new THREE.MeshStandardMaterial({color: 0xff3a2a, emissive: 0xff1a10, emissiveIntensity: 1});

	let content = new THREE.Group();
	scene.add(content);

	type Inst = {geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[]};
	const m4 = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) =>
		new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(sx, sy, sz));

	function build(p: ThreeParams) {
		scene.remove(content);
		content.traverse((o) => {
			if (o instanceof THREE.InstancedMesh) o.dispose();
		});
		content = new THREE.Group();
		scene.add(content);
		const groups = new Map<string, Inst>();
		const add = (id: string, geo: THREE.BufferGeometry, material: THREE.Material, matrix: THREE.Matrix4) => {
			const g = groups.get(id) ?? groups.set(id, {geo, mat: material, m: []}).get(id)!;
			g.m.push(matrix);
		};
		const scaleOf = (c: Cell) => (c.life === 0 ? (p.sized ? 0.62 : 0.9) : p.sized ? p.sizeOf(c.life) : 1);
		for (const cell of p.board.values()) {
			const dim = !!p.focus && cell.owner !== p.focus;
			const X = cell.x * S;
			const Y = -cell.y * S;
			const hex = jewel(cell.color);
			const evil = cell.color === EVIL;
			const s = scaleOf(cell) * R;
			const ghost = cell.planned === 'place';
			add('shadow' + dim, planeGeo, mat('shadow', () => new THREE.MeshBasicMaterial({map: shadowTex, transparent: true, depthWrite: false}), dim), m4(X + 3, Y - 4, 0.3, s * 2.6, s * 2.6, 1));
			if (cell.life === 0 && !ghost) {
				add(`husk${cell.color}${dim}`, discGeo, mat(`husk${cell.color}`, () => new THREE.MeshStandardMaterial({color: new THREE.Color(hex).lerp(new THREE.Color(0x7a746a), 0.6), roughness: 0.95}), dim), m4(X, Y, 1.5, s * 0.92, s * 0.92, 3));
				continue;
			}
			// the stack: one disc per gem under the top one
			const discH = R * 0.2;
			for (let g = 0; g < cell.stake - 1; g++) {
				add(`disc${cell.color}${dim}`, discGeo, mat(`disc${cell.color}`, () => new THREE.MeshPhysicalMaterial({color: new THREE.Color(evil ? 0x1e1e1e : hex).multiplyScalar(0.55), roughness: 0.3, clearcoat: 1}), dim), m4(X, Y, discH * (g + 0.5), s, s, discH * 0.92));
			}
			const z0 = discH * (cell.stake - 1);
			if (ghost) {
				add(`ghost${cell.color}`, gemGeo, mat(`ghost${cell.color}`, () => new THREE.MeshStandardMaterial({color: hex, transparent: true, opacity: 0.4, roughness: 0.3, emissive: hex, emissiveIntensity: 0.3, depthWrite: false}), false), m4(X, Y, z0, s, s, s));
				continue;
			}
			add(`gem${cell.color}${dim}`, gemGeo, mat(`gem${cell.color}`, () => gemMaterial(hex, {evil}), dim), m4(X, Y, z0, s, s, s));
			if (!evil) add(`foil${cell.color}${dim}`, foilGeo, mat(`foil${cell.color}`, () => foilMaterial(hex), dim), m4(X, Y, z0 + 0.6, s, s, 1));
			const {trend} = pressureOf(p.board, cell);
			if (cell.owner === ME) add('bezel' + dim, bezelGeo, mat('bezel', () => new THREE.MeshStandardMaterial({color: 0xd9a93a, metalness: 1, roughness: 0.22}), dim), m4(X, Y, z0 + s * 0.08, s * 1.08, s * 1.08, s));
			if (trend === 'shrink') add('rim' + dim, torusGeo, mat('rim', () => new THREE.MeshStandardMaterial({color: 0xd01c14, emissive: 0x8a0a05, emissiveIntensity: 0.8}), dim), m4(X, Y, z0 + s * 0.1, s * 0.99, s * 0.99, s));
			if (trend === 'grow' && p.sized) add('glow' + dim, torusGeo, mat('glow', () => new THREE.MeshStandardMaterial({color: 0xfff0c0, emissive: 0xffe08a, emissiveIntensity: 0.9}), dim), m4(X, Y, z0 + s * 0.1, s * 1.1, s * 1.1, s * 0.6));
			if (p.dial) {
				const filled = trend === 'shrink' ? cell.life - 1 : cell.life;
				const ring = 0.74;
				const h = (0.12 + 0.32 * Math.cos(((ring - 0.5) / 0.5) * (Math.PI / 2)) ** 0.75) * s;
				for (let i = 0; i < 7; i++) {
					const a = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
					const px = X + Math.cos(a) * s * ring;
					const py = Y - Math.sin(a) * s * ring;
					const pending = (trend === 'grow' && i === cell.life && i < 7) || (trend === 'shrink' && i === cell.life - 1);
					if (pending) add('pending' + trend + dim, pipGeo, trend === 'grow' ? pendingGrow : pendingShrink, m4(px, py, z0 + h, s * 0.13, s * 0.13, s * 0.08));
					else if (i < filled)
						add('pip' + evil + dim, pipGeo, mat('pip' + evil, () => new THREE.MeshStandardMaterial({color: evil ? 0xefe6d2 : 0x1d130a, roughness: 0.4}), dim), m4(px, py, z0 + h, s * 0.11, s * 0.11, s * 0.06));
					else add('hole' + dim, pipGeo, mat('hole', () => new THREE.MeshStandardMaterial({color: 0x000000, transparent: true, opacity: 0.35, roughness: 0.9}), dim), m4(px, py, z0 + h - 0.5, s * 0.06, s * 0.06, s * 0.02));
				}
			}
			if (cell.planned === 'remove') {
				for (const r of [Math.PI / 4, -Math.PI / 4]) add('cross', boxGeo, mat('cross', () => new THREE.MeshStandardMaterial({color: 0xb0141a, emissive: 0x500000}), false), m4(X, Y, z0 + s * 0.5, s * 1.2, s * 0.14, 3, r));
			}
		}
		if (p.links) {
			for (const l of linksOf(p.board)) {
				const a = p.board.get(key(l.ax, l.ay))!;
				const b = p.board.get(key(l.bx, l.by))!;
				const ra = R * 0.8 * scaleOf(a);
				const rb = R * 0.8 * scaleOf(b);
				const horiz = l.ay === l.by;
				const dimL = !!p.focus && (l.kind === 'bridge' ? !(a.owner === p.focus && b.owner === p.focus) : a.owner !== p.focus && b.owner !== p.focus);
				if (l.kind === 'bridge') {
					const len = S - ra - rb;
					const cx = horiz ? l.ax * S + ra + len / 2 : l.ax * S;
					const cy = horiz ? -l.ay * S : -(l.ay * S + ra + len / 2);
					const col = jewel(a.color);
					add(`bridge${a.color}${dimL}`, boxGeo, mat(`bridge${a.color}`, () => new THREE.MeshPhysicalMaterial({color: col, roughness: 0.25, clearcoat: 1}), dimL), m4(cx, cy, 3, horiz ? len : S * 0.24, horiz ? S * 0.24 : len, 5));
				} else {
					const mx = ((l.ax + l.bx) * S) / 2;
					const my = (-(l.ay + l.by) * S) / 2;
					const h = S * 0.16;
					for (const sgn of [1, -1]) {
						// a triangular prism's first vertex points along +x; turn it to point at the line
						const [px, py, rot] = horiz ? [mx, my + sgn * h, sgn > 0 ? -Math.PI / 2 : Math.PI / 2] : [mx + sgn * h, my, sgn > 0 ? Math.PI : 0];
						add('notch' + dimL, prismGeo, mat('notch', () => new THREE.MeshStandardMaterial({color: 0xc0151c, emissive: 0x400000, roughness: 0.4}), dimL), m4(px, py, 3, S * 0.09, S * 0.09, 6, rot));
					}
					add('notchline' + dimL, boxGeo, mat('notch', () => new THREE.MeshStandardMaterial({color: 0xc0151c}), dimL), m4(mx, my, 1, horiz ? S * 0.5 : 3, horiz ? 3 : S * 0.5, 1));
				}
			}
		}
		for (const g of groups.values()) {
			const im = new THREE.InstancedMesh(g.geo, g.mat, g.m.length);
			g.m.forEach((m, i) => im.setMatrixAt(i, m));
			im.instanceMatrix.needsUpdate = true;
			im.frustumCulled = false;
			content.add(im);
		}
		if (p.outlines) {
			for (const [color, segs] of factionOutlines(p.board)) {
				const pts: number[] = [];
				for (const s of segs) pts.push(s.x1 * S, -s.y1 * S, 2, s.x2 * S, -s.y2 * S, 2);
				const geo = new THREE.BufferGeometry();
				geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
				content.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({color: new THREE.Color(jewel(color))})));
			}
		}
	}

	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
	let tilt = 0;
	function setCamera(c: {x: number; y: number; scale: number}, w: number, h: number, tiltDeg: number) {
		tilt = (tiltDeg * Math.PI) / 180;
		renderer.setSize(w, h, false);
		camera.left = -w / 2 / c.scale;
		camera.right = w / 2 / c.scale;
		camera.top = h / 2 / c.scale;
		camera.bottom = -h / 2 / c.scale;
		const target = new THREE.Vector3(c.x, -c.y, 0);
		const D = 5000;
		camera.position.set(c.x, -c.y - Math.sin(tilt) * D, Math.cos(tilt) * D);
		camera.up.set(0, 1, 0);
		camera.lookAt(target);
		camera.updateProjectionMatrix();
	}
	const ray = new THREE.Raycaster();
	const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
	function screenToWorld(sx: number, sy: number, w: number, h: number): {x: number; y: number} | undefined {
		ray.setFromCamera(new THREE.Vector2((sx / w) * 2 - 1, -(sy / h) * 2 + 1), camera);
		const hit = new THREE.Vector3();
		if (!ray.ray.intersectPlane(plane, hit)) return;
		return {x: hit.x, y: -hit.y};
	}
	function frame(t: number) {
		const k = 0.5 + 0.5 * Math.sin(t * 4);
		pendingGrow.emissiveIntensity = 0.3 + 2.2 * k;
		pendingShrink.emissiveIntensity = 0.3 + 2.2 * k;
		renderer.render(scene, camera);
	}
	return {
		canvas: renderer.domElement,
		build,
		setCamera,
		screenToWorld,
		frame,
		get tilt() {
			return tilt;
		},
		info: () => renderer.info.render,
	};
}

export {MAX_LIFE};

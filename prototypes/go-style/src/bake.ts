/**
 * THROWAWAY PROTOTYPE. The gem as a 3D object: a foil-backed cabochon (a domed
 * gem with a flat table, which is also the shape of a Go stone), lit by an
 * environment. Used twice: baked once per colour into a sprite face for the
 * pixi "baked" look, and live, instanced, by the three.js look.
 */
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/** Radius 1, the table at the top, the girdle at z 0..0.12; the axis is +z. */
export function cabochonGeometry(segments = 48): THREE.BufferGeometry {
	const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0.44), new THREE.Vector2(0.5, 0.44)];
	for (let i = 1; i <= 12; i++) {
		const r = 0.5 + (0.5 * i) / 12;
		const u = (r - 0.5) / 0.5;
		pts.push(new THREE.Vector2(r, 0.12 + 0.32 * Math.cos((u * Math.PI) / 2) ** 0.75));
	}
	pts.push(new THREE.Vector2(1, 0), new THREE.Vector2(0.001, 0));
	// LatheGeometry wants the profile from the bottom up for outward faces (top-down, as round 2 had it, every face pointed in)
	pts.reverse();
	const g = new THREE.LatheGeometry(pts, segments);
	g.rotateX(Math.PI / 2);
	g.computeVertexNormals();
	return g;
}

export function gemMaterial(hex: string, opts: {evil?: boolean} = {}): THREE.MeshPhysicalMaterial {
	const color = new THREE.Color(hex);
	if (opts.evil) {
		return new THREE.MeshPhysicalMaterial({color: 0x202020, roughness: 0.55, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.4});
	}
	return new THREE.MeshPhysicalMaterial({
		color,
		roughness: 0.05,
		metalness: 0,
		transmission: 0.3,
		thickness: 0.8,
		ior: 1.55,
		attenuationColor: color,
		attenuationDistance: 0.25,
		clearcoat: 1,
		clearcoatRoughness: 0.05,
		specularIntensity: 1,
	});
}

/** The foil under the gem: what the light comes back from, so the gem glows. */
export function foilMaterial(hex: string): THREE.MeshStandardMaterial {
	const color = new THREE.Color(hex);
	return new THREE.MeshStandardMaterial({color, emissive: color, emissiveIntensity: 0.12, metalness: 0.3, roughness: 0.5});
}

export function environment(renderer: THREE.WebGLRenderer): THREE.Texture {
	const pmrem = new THREE.PMREMGenerator(renderer);
	const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	pmrem.dispose();
	return env;
}

/** Render one gem face per colour, top-down, into canvases (`px` square, frustum radius 1.1). */
export function bakeFaces(colours: {id: number; hex: string}[], px: number): Map<number, HTMLCanvasElement> {
	const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, preserveDrawingBuffer: true});
	renderer.setSize(px, px, false);
	renderer.setPixelRatio(1);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.9;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	const scene = new THREE.Scene();
	scene.environment = environment(renderer);
	scene.environmentIntensity = 0.7;
	// the room is Y-up and the board Z-up: turn it so its lights hang above the board and show in the gems
	scene.environmentRotation.set(Math.PI / 2, 0, 0.6);
	const key = new THREE.DirectionalLight(0xffffff, 1.2);
	key.position.set(-1, 1.2, 2);
	scene.add(key);
	const camera = new THREE.OrthographicCamera(-1.1, 1.1, 1.1, -1.1, 0.1, 10);
	camera.position.set(0, 0, 5);
	camera.lookAt(0, 0, 0);
	const geometry = cabochonGeometry(64);
	const foilGeometry = new THREE.CircleGeometry(0.93, 64);
	const out = new Map<number, HTMLCanvasElement>();
	for (const {id, hex} of colours) {
		const evil = id === 6;
		const gem = new THREE.Mesh(geometry, gemMaterial(hex, {evil}));
		const foil = new THREE.Mesh(foilGeometry, foilMaterial(hex));
		foil.position.z = 0.02;
		scene.add(gem, foil);
		renderer.render(scene, camera);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = px;
		canvas.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
		out.set(id, canvas);
		scene.remove(gem, foil);
		(gem.material as THREE.Material).dispose();
		(foil.material as THREE.Material).dispose();
	}
	geometry.dispose();
	renderer.dispose();
	renderer.forceContextLoss();
	return out;
}

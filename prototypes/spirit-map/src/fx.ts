/**
 * THROWAWAY PROTOTYPE. Particles as points animated in the shader: looping
 * (kinds 0 to 5) or played once (kinds 10 to 15, the start time as phase).
 * 0 a mote rising, 1 an ember falling, 2 a bolt along an arc, 3 smoke,
 * 4 a spark, 5 a steady glow.
 */
import * as THREE from 'three';
import {uniforms} from './terrain';

/* ---------- particles ---------- */

export const FX_VERT = `
uniform float uTime; uniform float uScale;
attribute vec3 aB; attribute vec3 aColor; attribute vec4 aSeed;
varying vec3 vColor; varying float vAlpha;
void main(){
	float phase = aSeed.x, speed = aSeed.y, kind = aSeed.z, size = aSeed.w;
	// kinds from 10 play once: phase is the start time, speed one over the duration
	bool once = kind > 9.5;
	if (once) kind -= 10.0;
	float f = once ? (uTime - phase) * speed : fract(uTime * speed + phase);
	float live = once ? step(0.0, f) * step(f, 1.0) : 1.0;
	f = clamp(f, 0.0, 1.0);
	vec3 p = position; float a = 1.0; float s = size;
	if (kind < 0.5) {
		p += vec3(sin(f * 6.0 + phase * 20.0) * 0.05, f * 0.55, cos(f * 5.0 + phase * 13.0) * 0.05);
		a = sin(3.14159 * f);
	} else if (kind < 1.5) {
		p += vec3(sin(phase * 40.0) * 0.12 * f, 0.5 * (1.0 - f) - 0.05, cos(phase * 30.0) * 0.12 * f);
		a = sin(3.14159 * f);
	} else if (kind < 2.5) {
		p = mix(position, aB, f) + vec3(0.0, sin(3.14159 * f) * 0.22, 0.0);
		a = smoothstep(0.0, 0.1, f) * (1.0 - smoothstep(0.9, 1.0, f));
		s = size * (0.6 + 0.8 * f);
	} else if (kind < 3.5) {
		p += vec3(sin(f * 3.0 + phase * 9.0) * 0.15 * f, f * 1.5, cos(f * 2.0 + phase * 7.0) * 0.1 * f);
		a = (1.0 - f) * smoothstep(0.0, 0.08, f) * 0.6;
		s = size * (0.5 + 2.0 * f);
	} else if (kind < 4.5) {
		a = pow(1.0 - f, 3.0);
		s = size * (0.5 + f * 1.4);
	} else {
		a = 0.6;
	}
	vColor = aColor; vAlpha = a * live;
	vec4 mv = modelViewMatrix * vec4(p, 1.0);
	gl_PointSize = s * uScale / -mv.z;
	gl_Position = projectionMatrix * mv;
}`;
const FX_FRAG = `
varying vec3 vColor; varying float vAlpha;
void main(){
	float d = length(gl_PointCoord - 0.5);
	float k = smoothstep(0.5, 0.05, d);
	gl_FragColor = vec4(vColor, vAlpha * k);
}`;

export const fxUniforms = {uScale: {value: 500}};

export const fxGlow = new THREE.ShaderMaterial({
	vertexShader: FX_VERT,
	fragmentShader: FX_FRAG,
	uniforms: {uTime: uniforms.uTime, uScale: fxUniforms.uScale},
	transparent: true,
	depthWrite: false,
	blending: THREE.AdditiveBlending,
});
export const fxSmoke = new THREE.ShaderMaterial({
	vertexShader: FX_VERT,
	fragmentShader: FX_FRAG,
	uniforms: {uTime: uniforms.uTime, uScale: fxUniforms.uScale},
	transparent: true,
	depthWrite: false,
});

export class FxBuilder {
	a: number[] = [];
	b: number[] = [];
	c: number[] = [];
	s: number[] = [];
	push(a: THREE.Vector3Like, b: THREE.Vector3Like, color: THREE.Color, phase: number, speed: number, kind: number, size: number) {
		this.a.push(a.x, a.y, a.z);
		this.b.push(b.x, b.y, b.z);
		this.c.push(color.r, color.g, color.b);
		this.s.push(phase, speed, kind, size);
	}
	build(material: THREE.Material): THREE.Points | undefined {
		if (!this.a.length) return undefined;
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(this.a, 3));
		g.setAttribute('aB', new THREE.Float32BufferAttribute(this.b, 3));
		g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.c, 3));
		g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.s, 4));
		g.computeBoundingSphere();
		if (g.boundingSphere) g.boundingSphere.radius += 2;
		const p = new THREE.Points(g, material);
		p.renderOrder = 2;
		return p;
	}
}


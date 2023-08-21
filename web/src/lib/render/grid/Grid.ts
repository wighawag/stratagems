import {Geometry, Mesh, Shader} from 'pixi.js';

/**
 * You can use it with pixi-viewport:
 *
 * // instantiate with a cell size and color
 * const grid = new Grid(1, [0x4a / 256,0x4e / 256,0x69 / 256,1]);
 * // add it to the stage
 * app.stage.addChild(grid);
 * // listen for viewport changes
 * viewport.on('moved', (ev) => {
 *   // set the uniform via viewport corner and its otjer properties
 *   grid.setUniforms(viewport.corner, viewport)
 * })
 * // set the uniform first
 * grid.setUniforms(viewport.corner, viewport)
 */
export class Grid extends Mesh<Shader> {
	protected gridUniforms: {
		u_offset: [number, number];
		u_size: number;
		u_color: [number, number, number, number];
		u_bgColor: [number, number, number, number];
	};
	constructor(
		protected cellSize: number,
		color?: [number, number, number, number],
		bgColor?: [number, number, number, number],
	) {
		// ------------------ QUAD
		const vertexShaderSource = `#version 300 es
		in vec2 position;
		void main() {
			gl_Position = vec4( position, 1.0, 1.0 );
		}
		`;

		const fragmentShaderSource = `#version 300 es
		// fragment shaders don't have a default precision so we need
		// to pick one. highp is a good default. It means "high precision"
		precision highp float;

		uniform vec4 u_color;
		uniform vec4 u_bgColor;
		uniform float u_size;
		uniform vec2 u_offset; 

		// we need to declare an output for the fragment shader
		out vec4 outColor;

		void main() {    
			if (int(mod(gl_FragCoord.x + u_offset[0], u_size)) == 0 || int(mod(gl_FragCoord.y + u_offset[1], u_size)) == 0) {
				outColor = mix(u_color, u_bgColor, 4.0 / u_size);
			} else {
				outColor = u_bgColor;
			}
		}
		`;
		// Build geometry.
		const geometry = new Geometry()
			.addAttribute(
				'position', // the attribute name
				[-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0],
				2,
			) // the size of the attribute
			.addIndex([0, 1, 2, 0, 2, 3]);

		const uniforms = {
			u_offset: [0, 0] as [number, number],
			u_size: 1,
			u_color: color || ([1, 1, 1, 1] as [number, number, number, number]),
			u_bgColor: bgColor || ([0, 0, 0, 0] as [number, number, number, number]),
		};

		const shader = Shader.from(vertexShaderSource, fragmentShaderSource, uniforms);
		super(geometry, shader);
		this.gridUniforms = uniforms;
	}

	setUniforms(
		{x, y}: {x: number; y: number},
		{
			worldWidth,
			worldHeight,
			screenWidth,
			screenHeight,
			worldScreenWidth,
			worldScreenHeight,
		}: {
			worldWidth: number;
			worldHeight: number;
			screenWidth: number;
			screenHeight: number;
			worldScreenWidth: number;
			worldScreenHeight: number;
		},
	) {
		const renderScale = (worldHeight / worldScreenHeight) * (screenHeight / worldHeight);
		const offsetX = x - Math.floor(x / this.cellSize) * this.cellSize;
		// const offsetY = Math.floor((y - worldScreenHeight) / this.cellSize) * this.cellSize - y - worldScreenHeight;
		const yy = y + worldScreenHeight;
		const offsetY = Math.floor(yy / this.cellSize) * this.cellSize - yy;
		// const yy = worldScreenHeight - y;
		// const offsetY = yy - Math.floor(yy / this.cellSize) * this.cellSize;

		this.gridUniforms.u_size = renderScale * this.cellSize;
		this.gridUniforms.u_offset = [offsetX * renderScale, offsetY * renderScale];
	}
}

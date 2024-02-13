import {parseColorV4} from '$utils/webgl/color';

export const COLORS = [0x000000, 0x00a4dd, 0xff6e71, 0x27d17c, 0xd3d66d, 0x9660c8, 0x3d3d3d];

export const COLORS_VEC4 = [
	[0, 0, 0, 1],
	parseColorV4('00a4dd'),
	parseColorV4('ff6e71'),
	parseColorV4('27d17c'),
	parseColorV4('d3d66d'),
	parseColorV4('9660c8'),
	parseColorV4('3d3d3d'),
];

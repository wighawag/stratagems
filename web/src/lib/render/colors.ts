import {parseColorV4} from '$lib/webgl/color';

export const COLORS = [0x000000, 0xef476f, 0xffd166, 0x06d6a0, 0x118ab2];

export const COLORS_VEC4 = [
	[0, 0, 0, 1],
	parseColorV4('ef476f'),
	parseColorV4('ffd166'),
	parseColorV4('06d6a0'),
	parseColorV4('118ab2'),
];

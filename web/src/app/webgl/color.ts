export function parseColorV4(c: string | number) {
	let hasAlpha = false;
	if (typeof c === 'string') {
		if (c.startsWith('0x')) {
			hasAlpha = c.length > 8;
			c = parseInt(c.slice(2), 16);
		} else {
			hasAlpha = c.length > 6;
			c = parseInt(c, 16);
		}
	}
	const r = c >> (hasAlpha ? 24 : 16);
	const g = (c >> (hasAlpha ? 16 : 8)) & 0xff;
	const b = (c >> (hasAlpha ? 8 : 0)) & 0xff;
	const a = hasAlpha ? c & 0xff : 255;
	return [r / 255, g / 255, b / 255, a / 255];
}

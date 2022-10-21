const leftMostBit = BigInt('0x8000000000000000');
const bn32 = BigInt('0x10000000000000000');
export function positionToXYID(position: string) {
	const bn = BigInt(position);
	const x = BigInt.asUintN(32, bn);
	const y = bn >> 32n;
	const rx = x >= leftMostBit ? -(bn32 - x) : x;
	const ry = y >= leftMostBit ? -(bn32 - y) : y;
	return '' + rx + ',' + ry;
}

export function xyToXYID(x: number, y: number) {
	return '' + x + ',' + y;
}

export function xyToPosition(x: number, y: number): string {
	const bn = BigInt(x) + (BigInt(y) << 32n);
	return bn.toString(10);
}

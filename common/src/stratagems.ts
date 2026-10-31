import {CellXYPosition} from './types';

export function bigIntIDToXYID(position: bigint): string {
	const {x, y} = bigIntIDToXY(position);
	return '' + x + ',' + y;
}

export function countBits(n: number): number {
	let count = 0;
	while (n != 0) {
		n = n & (n - 1);
		count++;
	}
	return count;
}

// using 64 bits room id
// const leftMostBit = BigInt('0x8000000000000000');
// const bn32 = BigInt('0x10000000000000000');
export function bigIntIDToXY(position: bigint): CellXYPosition {
	const bn = BigInt(position);
	const x = Number(BigInt.asIntN(32, bn));
	const y = Number(BigInt.asIntN(32, bn >> 32n));
	// const rx = x >= leftMostBit ? -(bn32 - x) : x;
	// const ry = y >= leftMostBit ? -(bn32 - y) : y;
	return {x, y};
}

export type CellBigIntXYPosition = {
	x: bigint;
	y: bigint;
};

export function bigIntIDToBigintXY(position: bigint): CellBigIntXYPosition {
	const bn = BigInt(position);
	const x = BigInt.asIntN(32, bn);
	const y = BigInt.asIntN(32, bn >> 32n);
	return {x, y};
}

export function xyToXYID(x: number, y: number) {
	return '' + x + ',' + y;
}

export function IDToXY(id: string) {
	const [x, y] = id.split(',').map(Number);
	return {x, y};
}

export function xyToBigIntID(x: number, y: number): bigint {
	// const bn = (BigInt.asUintN(32, BigInt(x)) + BigInt.asUintN(32, BigInt(y))) << 32n;
	const bn = (x < 0 ? 2n ** 32n + BigInt(x) : BigInt(x)) + ((y < 0 ? 2n ** 32n + BigInt(y) : BigInt(y)) << 32n);
	return bn;
}

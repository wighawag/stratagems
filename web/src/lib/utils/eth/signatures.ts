import {hexToSignature} from 'viem';

export function hexToVRS(sig: `0x${string}`) {
	const {v, r, s} = hexToSignature(sig);
	console.log({v, r, s});
	return {
		v: Number(v),
		r: (`0x` + r.slice(2).padStart(64, '0')) as `0x${string}`,
		s: (`0x` + s.slice(2).padStart(64, '0')) as `0x${string}`,
	};
}

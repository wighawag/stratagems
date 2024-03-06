import type {OffchainState} from '$lib/account/account-data';
import type {Color} from 'stratagems-common';

export function getCurrentColor(offchainState: OffchainState, address?: `0x${string}`): Color {
	return offchainState.currentColor.color || Number(address ? (BigInt(address) % 5n) + 1n : 1n);
}

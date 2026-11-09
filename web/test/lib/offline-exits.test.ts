import {describe, it, expect, vi, afterEach} from 'vitest';
import {offlineWorldExits, tryTheWorldAgain} from '$lib/offline-exits';

/**
 * WHICH WAYS OUT AN OFFLINE WORLD OFFERS, per step of its boot.
 *
 * The decision lives in a plain module so the navbar and the page only render
 * it (AGENTS.md "Svelte conventions"). The case that matters is `Failed`: Home
 * keeps the same table, so without "Leave this table" there a world that fails
 * every boot has no exit short of clearing site data.
 */
const sat = {step: 'Sat' as const, seats: 4};

describe('the exits of an offline world', () => {
	it('offers leaving the table, and the seat count, once the world is Ready', () => {
		expect(offlineWorldExits({step: 'Ready'}, sat)).toEqual({
			leaveTheTable: true,
			tryAgain: false,
			seats: 4,
		});
	});

	it('offers leaving the table AND trying again when the boot Failed', () => {
		expect(offlineWorldExits({step: 'Failed'}, sat)).toEqual({
			leaveTheTable: true,
			tryAgain: true,
			seats: 4,
		});
	});

	it('shows no seat count for a failed world whose table is not known', () => {
		// The lobby's count is only the world's table once it has sat down (or
		// restored one); before that it is a default, not a fact about this world.
		const exits = offlineWorldExits(
			{step: 'Failed'},
			{step: 'Opening', seats: 3},
		);
		expect(exits.leaveTheTable).toBe(true);
		expect(exits.tryAgain).toBe(true);
		expect(exits.seats).toBeUndefined();
	});

	it('offers nothing while the world is booting or idle, so a boot is never interrupted', () => {
		for (const step of ['Idle', 'Booting'] as const) {
			expect(offlineWorldExits({step}, sat)).toEqual({
				leaveTheTable: false,
				tryAgain: false,
				seats: undefined,
			});
		}
	});
});

describe('trying the world again', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('reloads the page, and forgets nothing, so the same world restores', () => {
		let reloads = 0;
		const removed: string[] = [];
		vi.stubGlobal('location', {reload: () => void reloads++});
		vi.stubGlobal('localStorage', {
			removeItem: (key: string) => void removed.push(key),
		});
		tryTheWorldAgain();
		expect(reloads).toBe(1);
		expect(removed).toEqual([]);
	});
});

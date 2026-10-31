import {describe, expect, it, vi} from 'vitest';
import {get, writable} from 'svelte/store';
import {Color} from 'stratagems-common';
import type {GameIdentity} from '$lib/game/identity';
import {
	createWinnings,
	positionsToPoke,
	sharesOwed,
} from '$lib/stratagems/winnings';
import {
	type Played,
	ALICE,
	BOB,
	CAROL,
	GEM,
	MAX_LIFE,
	at,
	boardAfter,
	boardStore,
} from './board';

/**
 * Alice's cell at 0,0 is ringed on the right by Bob's four, and dies in cycle 3
 * with Bob's 1,0 its only enemy: its one gem is Bob's to collect, whole.
 */
const ONE_ENEMY: {cycle: number; moves: Played[]}[] = [
	{
		cycle: 1,
		moves: [
			{player: ALICE, x: 0, y: 0, color: Color.Blue},
			{player: BOB, x: 1, y: 0, color: Color.Red},
			{player: BOB, x: 2, y: 0, color: Color.Red},
			{player: BOB, x: 1, y: 1, color: Color.Red},
			{player: BOB, x: 1, y: -1, color: Color.Red},
		],
	},
];

const owed = async (
	cycles: typeof ONE_ENEMY,
	cycle: number,
	player: `0x${string}`,
) =>
	sharesOwed({
		board: await boardAfter(cycles, cycle),
		player,
		numTokensPerGems: GEM,
		maxLife: MAX_LIFE,
	});

describe('what a dead cell owes', () => {
	it('owes nothing while it lives', async () => {
		expect(await owed(ONE_ENEMY, 2, BOB)).toEqual([]);
	});

	it("owes its stake to its enemy's owner once it has died, split by its enemies", async () => {
		expect(await owed(ONE_ENEMY, 3, BOB)).toEqual([
			{position: at(1, 0), from: at(0, 0), amount: GEM},
		]);
		// and nothing to its own owner, or to anyone else
		expect(await owed(ONE_ENEMY, 3, ALICE)).toEqual([]);
		expect(await owed(ONE_ENEMY, 3, CAROL)).toEqual([]);
	});

	it('splits between two enemies of different owners, one share each', async () => {
		// Carol's -1,0 on Alice's left, with three friends of her own around it,
		// none touching Bob's
		const twoEnemies: {cycle: number; moves: Played[]}[] = [
			{
				cycle: 1,
				moves: [
					...ONE_ENEMY[0].moves,
					{player: CAROL, x: -1, y: 0, color: Color.Green},
					{player: CAROL, x: -2, y: 0, color: Color.Green},
					{player: CAROL, x: -1, y: 1, color: Color.Green},
					{player: CAROL, x: -1, y: -1, color: Color.Green},
				],
			},
		];
		let deathCycle = 0;
		for (const cycle of [2, 3, 4]) {
			if ((await owed(twoEnemies, cycle, BOB)).length > 0) {
				deathCycle = cycle;
				break;
			}
		}
		expect(await owed(twoEnemies, deathCycle, BOB)).toEqual([
			{position: at(1, 0), from: at(0, 0), amount: GEM / 2n},
		]);
		expect(await owed(twoEnemies, deathCycle, CAROL)).toEqual([
			{position: at(-1, 0), from: at(0, 0), amount: GEM / 2n},
		]);
	});

	it("pokes each of the player's cells once, however many shares it is owed", async () => {
		expect(
			positionsToPoke([
				{position: at(1, 0), from: at(0, 0), amount: 1n},
				{position: at(1, 0), from: at(2, 1), amount: 1n},
				{position: at(5, 5), from: at(5, 6), amount: 1n},
			]),
		).toEqual([at(1, 0), at(5, 5)]);
	});
});

describe('collecting', () => {
	async function setup(send = vi.fn(async () => {})) {
		const onCollected = vi.fn();
		const winnings = createWinnings({
			onchainState: boardStore(await boardAfter(ONE_ENEMY, 3)),
			identity: writable<GameIdentity | undefined>(BOB),
			numTokensPerGems: GEM,
			maxLife: MAX_LIFE,
			game: {address: '0x000000000000000000000000000000000000c0de', abi: []},
			send,
			onCollected,
		});
		return {winnings, send, onCollected};
	}

	it("totals what is owed, and pokes the player's cells from the wallet", async () => {
		const {winnings, send, onCollected} = await setup();
		expect(get(winnings).total).toBe(GEM);
		await winnings.collect();
		expect(send).toHaveBeenCalledWith(
			{
				address: '0x000000000000000000000000000000000000c0de',
				abi: [],
				functionName: 'pokeMultiple',
				args: [[at(1, 0)]],
			},
			'Collecting your winnings',
		);
		expect(onCollected).toHaveBeenCalledOnce();
		expect(get(winnings).collecting).toEqual({step: 'Idle'});
	});

	it('keeps the failure to show, and sends nothing when nothing is owed', async () => {
		const {winnings} = await setup(
			vi.fn(async () => {
				throw new Error('user rejected');
			}),
		);
		await winnings.collect();
		expect(get(winnings).collecting).toEqual({
			step: 'Error',
			message: 'user rejected',
		});

		const send = vi.fn(async () => {});
		const nothing = createWinnings({
			onchainState: boardStore(await boardAfter(ONE_ENEMY, 2)),
			identity: writable<GameIdentity | undefined>(BOB),
			numTokensPerGems: GEM,
			maxLife: MAX_LIFE,
			game: {address: '0x000000000000000000000000000000000000c0de', abi: []},
			send,
		});
		await nothing.collect();
		expect(send).not.toHaveBeenCalled();
	});
});

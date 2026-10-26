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

const owed = (cycles: typeof ONE_ENEMY, cycle: number, player: `0x${string}`) =>
	sharesOwed({
		board: boardAfter(cycles, cycle),
		player,
		numTokensPerGems: GEM,
		maxLife: MAX_LIFE,
	});

describe('what a dead cell owes', () => {
	it('owes nothing while it lives', () => {
		expect(owed(ONE_ENEMY, 2, BOB)).toEqual([]);
	});

	it("owes its stake to its enemy's owner once it has died, split by its enemies", () => {
		expect(owed(ONE_ENEMY, 3, BOB)).toEqual([
			{position: at(1, 0), from: at(0, 0), amount: GEM},
		]);
		// and nothing to its own owner, or to anyone else
		expect(owed(ONE_ENEMY, 3, ALICE)).toEqual([]);
		expect(owed(ONE_ENEMY, 3, CAROL)).toEqual([]);
	});

	it('splits between two enemies of different owners, one share each', () => {
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
		const deathCycle = [2, 3, 4].find(
			(cycle) => owed(twoEnemies, cycle, BOB).length > 0,
		)!;
		expect(owed(twoEnemies, deathCycle, BOB)).toEqual([
			{position: at(1, 0), from: at(0, 0), amount: GEM / 2n},
		]);
		expect(owed(twoEnemies, deathCycle, CAROL)).toEqual([
			{position: at(-1, 0), from: at(0, 0), amount: GEM / 2n},
		]);
	});

	it("pokes each of the player's cells once, however many shares it is owed", () => {
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
	function setup(send = vi.fn(async () => {})) {
		const onCollected = vi.fn();
		const winnings = createWinnings({
			onchainState: boardStore(boardAfter(ONE_ENEMY, 3)),
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
		const {winnings, send, onCollected} = setup();
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
		const {winnings} = setup(
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
			onchainState: boardStore(boardAfter(ONE_ENEMY, 2)),
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

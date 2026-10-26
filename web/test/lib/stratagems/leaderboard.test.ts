import {describe, expect, it} from 'vitest';
import {get, writable} from 'svelte/store';
import {Color} from 'stratagems-common';
import type {GameIdentity} from '$lib/game/identity';
import {
	createLeaderboard,
	leaderboardOf,
	pointsLabel,
} from '$lib/stratagems/leaderboard';
import {
	ALICE,
	BOB,
	CAROL,
	GEM,
	MAX_LIFE,
	boardAfter,
	boardStore,
} from './board';

const PRECISION = 10n ** 24n;

/** Alice has two living cells, Bob one, Carol none; the generator knows all three. */
function board() {
	const played = boardAfter(
		[
			{
				cycle: 1,
				moves: [
					{player: ALICE, x: 0, y: 0, color: Color.Blue},
					{player: ALICE, x: 0, y: 1, color: Color.Blue},
					{player: BOB, x: 5, y: 5, color: Color.Red},
				],
			},
		],
		2,
	);
	played.data.points.global = {
		lastUpdateTime: 100,
		totalRewardPerPointAtLastUpdate: 3n * PRECISION,
		totalPoints: 3n * GEM,
	};
	played.data.points.shared = {
		// accounted at 1: earned 2 per point since, on 2 points, plus 1 withdrawn
		[ALICE]: {
			points: 2n * GEM,
			totalRewardPerPointAccounted: 1n * PRECISION,
			rewardsToWithdraw: 1n,
		},
		// accounted at 0: earned 3 per point since, on 1 point
		[BOB]: {
			points: 1n * GEM,
			totalRewardPerPointAccounted: 0n,
			rewardsToWithdraw: 0n,
		},
		// nothing held, nothing earned
		[CAROL]: {
			points: 0n,
			totalRewardPerPointAccounted: 3n * PRECISION,
			rewardsToWithdraw: 0n,
		},
	};
	return played;
}

// `_computeRewardsEarned`: points * (rate delta) * 1e12 / 1e24
const earned = (points: bigint, perPoint: bigint) =>
	(points * perPoint * PRECISION * 10n ** 12n) / PRECISION;

describe('the leaderboard', () => {
	it("ranks by gems earned as of the generator's last update, then points", () => {
		const rows = leaderboardOf({
			board: board(),
			player: BOB,
			maxLife: MAX_LIFE,
		});
		expect(rows.map((row) => row.player)).toEqual([ALICE, BOB, CAROL]);
		expect(rows[0]).toEqual({
			player: ALICE,
			earned: 1n + earned(2n * GEM, 2n),
			points: 2n * GEM,
			lands: 2,
			mine: false,
		});
		expect(rows[1]).toMatchObject({
			earned: earned(GEM, 3n),
			lands: 1,
			mine: true,
		});
		expect(rows[2]).toMatchObject({earned: 0n, points: 0n, lands: 0});
	});

	it('breaks a tie on earnings by points, and a tie on both by address', () => {
		const tied = board();
		tied.data.points.shared = {
			[CAROL]: {
				points: GEM,
				totalRewardPerPointAccounted: 0n,
				rewardsToWithdraw: 0n,
			},
			[BOB]: {
				points: GEM,
				totalRewardPerPointAccounted: 0n,
				rewardsToWithdraw: 0n,
			},
			[ALICE]: {
				points: 2n * GEM,
				totalRewardPerPointAccounted: 3n * PRECISION,
				rewardsToWithdraw: earned(GEM, 3n),
			},
		};
		expect(
			leaderboardOf({board: tied, maxLife: MAX_LIFE}).map((row) => row.player),
		).toEqual([ALICE, BOB, CAROL]);
	});

	it("counts only the cells alive at the board's cycle", () => {
		// Alice's cell at 0,0, ringed by Bob's four, dies in cycle 3
		const played = (cycle: number) =>
			boardAfter(
				[
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
				],
				cycle,
			);
		const lands = (cycle: number) => {
			const b = played(cycle);
			b.data.points.shared = {
				[ALICE]: {
					points: 0n,
					totalRewardPerPointAccounted: 0n,
					rewardsToWithdraw: 0n,
				},
				[BOB]: {
					points: 0n,
					totalRewardPerPointAccounted: 0n,
					rewardsToWithdraw: 0n,
				},
			};
			return Object.fromEntries(
				leaderboardOf({board: b, maxLife: MAX_LIFE}).map((row) => [
					row.player,
					row.lands,
				]),
			);
		};
		expect(lands(2)).toEqual({[ALICE]: 1, [BOB]: 4});
		expect(lands(3)).toEqual({[ALICE]: 0, [BOB]: 4});
	});

	it('reads points as whole gems staked', () => {
		expect(pointsLabel(3n * GEM + 1n, GEM)).toBe('3');
	});

	it("is empty until the board loads, and marks the viewer's row", () => {
		const store = boardStore(undefined);
		const identity = writable<GameIdentity | undefined>(ALICE);
		const leaderboard = createLeaderboard({
			onchainState: store,
			identity,
			maxLife: MAX_LIFE,
		});
		expect(get(leaderboard)).toEqual([]);
		store.set(board());
		expect(get(leaderboard).find((row) => row.mine)?.player).toBe(ALICE);
	});
});

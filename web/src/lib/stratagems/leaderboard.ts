/**
 * THE LEADERBOARD (P3 of step 6c in work/plans/join-template-commit-reveal.md):
 * every player the rewards generator knows, from the indexer's `points`, ranked
 * by the gems they have earned, then by the points they hold, the legacy
 * `ui/leaderboard/` ported onto the composition.
 *
 * EARNED IS EXACT AS OF THE GENERATOR'S LAST UPDATE, not extrapolated to now:
 * `rewardsToWithdraw` plus what the account's points earned between its last
 * accounting and the global rate's last update (`RewardsGenerator`'s
 * `_computeRewardsEarned`, with no time term). The legacy view added the time
 * since then at a reward rate it hard-coded; the rate is the generator's
 * deploy-time configuration and is not in the deployment's linked data, so this
 * shows what the chain has accounted rather than a guess that drifts from it.
 * It moves whenever any player's points change, which is every reveal.
 *
 * `lands` counts the player's cells alive at the board's cycle.
 *
 * AT A TABLE, BY NET GEMS (step L4, L4-18): what the game gave each member less
 * what it took, each living cell valued as the end would value it now, so the
 * live ranking is the one that decides (`./score.ts`, `./table-end.ts`); lands
 * stay a column. Once the table is settled, the scores the chain recorded.
 */
import {derived, type Readable} from 'svelte/store';
import {cellAtCycle} from 'stratagems-common';
import type {OnchainStateStore, OnchainStateValue} from '$lib/game/core/seams';
import type {GameIdentity} from '$lib/game/identity';
import type {BoardState} from './board/indexed-board';
import type {TableEnd} from './table-end';
import type {TableScoreRow} from './score';

/** `RewardsGenerator`'s constants. */
const PRECISION = 10n ** 24n;
const DECIMALS_18_MILLIONTH = 10n ** 12n;

export type LeaderboardRow = {
	player: `0x${string}`;
	/** Gems earned so far, in token units. */
	earned: bigint;
	/**
	 * Points held now: the gems staked on the player's producing cells, in
	 * token units (the game adds `NUM_TOKENS_PER_GEMS * stake` per cell).
	 */
	points: bigint;
	lands: number;
	/** The row of the player viewing. */
	mine: boolean;
	/** At a table: net gems, in token units (live, then final once settled). */
	score?: bigint;
	/** At a settled table: one of its winners. */
	winner?: boolean;
};

/**
 * The leaderboard, as of `board`. Pure.
 *
 * AT A TABLE (`byLands`) there are no points and nothing is earned (its
 * generator is `NoRewards`, step L2's PL2-7), so the rows are every owner of a
 * living cell, ranked by the cells they hold.
 */
export function leaderboardOf(params: {
	board: BoardState;
	player?: `0x${string}`;
	maxLife: number;
	byLands?: boolean;
	/** At a table, the ranking by net gems (`./table-end.ts`): it decides the order. */
	tableScores?: readonly TableScoreRow[];
}): LeaderboardRow[] {
	const {data, cycleNumber} = params.board;
	const viewer = params.player?.toLowerCase();
	const global = data.points.global;

	const lands = new Map<string, number>();
	for (const key of Object.keys(data.cells)) {
		const owner = data.owners[key]?.toLowerCase();
		if (!owner) continue;
		const {cell} = cellAtCycle(data.cells[key], cycleNumber, params.maxLife);
		if (cell.life > 0) lands.set(owner, (lands.get(owner) ?? 0) + 1);
	}

	if (params.tableScores) {
		return params.tableScores.map((row) => ({
			player: row.player,
			earned: 0n,
			points: 0n,
			lands: lands.get(row.player.toLowerCase()) ?? 0,
			mine: row.player.toLowerCase() === viewer,
			score: row.score,
			winner: row.winner,
		}));
	}

	if (params.byLands) {
		return [...lands.entries()]
			.map(([owner, count]): LeaderboardRow => ({
				player: owner as `0x${string}`,
				earned: 0n,
				points: 0n,
				lands: count,
				mine: owner === viewer,
			}))
			.sort((a, b) =>
				a.lands !== b.lands
					? b.lands - a.lands
					: a.player < b.player
						? -1
						: a.player > b.player
							? 1
							: 0,
			);
	}

	const rows = Object.entries(data.points.shared).map(
		([account, shared]): LeaderboardRow => {
			const player = account.toLowerCase() as `0x${string}`;
			const earned =
				shared.rewardsToWithdraw +
				(shared.points *
					(global.totalRewardPerPointAtLastUpdate -
						shared.totalRewardPerPointAccounted) *
					DECIMALS_18_MILLIONTH) /
					PRECISION;
			return {
				player,
				earned,
				points: shared.points,
				lands: lands.get(player) ?? 0,
				mine: player === viewer,
			};
		},
	);
	return rows.sort((a, b) =>
		a.earned !== b.earned
			? a.earned > b.earned
				? -1
				: 1
			: a.points !== b.points
				? a.points > b.points
					? -1
					: 1
				: a.player < b.player
					? -1
					: a.player > b.player
						? 1
						: 0,
	);
}

/** Points as the player reads them: whole gems staked. */
export function pointsLabel(points: bigint, numTokensPerGems: bigint): string {
	return numTokensPerGems > 0n ? (points / numTokensPerGems).toString() : '0';
}

export function createLeaderboard(params: {
	onchainState: OnchainStateStore<BoardState>;
	identity: Readable<GameIdentity | undefined>;
	maxLife: number;
	/** At a table: ranked by lands, see `leaderboardOf`. */
	byLands?: boolean;
	/** At a table since step L4: ranked by net gems instead. */
	tableEnd?: TableEnd;
}): Readable<LeaderboardRow[]> {
	const board: Readable<OnchainStateValue<BoardState>> = {
		subscribe: params.onchainState.subscribe,
	};
	const tableEnd = params.tableEnd;
	if (tableEnd) {
		return derived(
			[board, params.identity, tableEnd],
			([$board, $identity, $end]) =>
				$board.step === 'Loaded' && $end.step === 'Loaded'
					? leaderboardOf({
							board: $board,
							player: $identity,
							maxLife: params.maxLife,
							tableScores: $end.rows,
						})
					: [],
		);
	}
	return derived([board, params.identity], ([$board, $identity]) =>
		$board.step === 'Loaded'
			? leaderboardOf({
					board: $board,
					player: $identity,
					maxLife: params.maxLife,
					byLands: params.byLands,
				})
			: [],
	);
}

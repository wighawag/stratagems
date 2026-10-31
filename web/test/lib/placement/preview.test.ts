import {describe, expect, it, vi} from 'vitest';
import {get, writable} from 'svelte/store';
import type {OnchainStateValue} from '$lib/game/core/seams';
import {
	createPlacementPreview,
	withPreview,
	type PlayerCell,
} from '$lib/placement/preview';
import type {BoardState, Cell} from '$lib/placement/state';
import type {LocalPlan} from '$lib/placement/view';
import type {Placement} from '$lib/placement/commit-reveal';

/**
 * The preview's own part is the LOAD: which cells the rule is handed, and as
 * whom. The rule itself is the contract's (`resolvePlacements`, run from its
 * bytecode) and is tested against the reveal in the contracts suite, so here
 * it is a stand-in that records what it was asked.
 */

const PLAYER = '0x00000000000000000000000000000000000000aa' as const;
const PLAYER_ID = BigInt(PLAYER);

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function loadedBoard(cells: Cell[], cycleNumber = 3) {
	return writable<OnchainStateValue<BoardState & {cycleNumber: number}>>({
		step: 'Loaded',
		cycleNumber,
		cells: new Map(cells.map((cell) => [cell.cellID, cell])),
	});
}

/** Adds one stake of 10 per placement, the way a rule would, and records. */
function standInRule() {
	const asked: {
		cells: readonly PlayerCell[];
		placements: readonly Placement[];
	}[] = [];
	const simulate = vi.fn(
		async (cells: readonly PlayerCell[], placements: readonly Placement[]) => {
			asked.push({cells, placements});
			return cells.map((cell) => ({
				...cell,
				totalStake: cell.totalStake + 10n,
				playerStake: cell.playerStake + 10n,
				numClaimants:
					cell.playerStake === 0n ? cell.numClaimants + 1 : cell.numClaimants,
			}));
		},
	);
	return {simulate, asked};
}

describe('createPlacementPreview', () => {
	it('hands the rule each planned cell as the player sees it', async () => {
		const plan = writable<LocalPlan>({planned: [1n, 2n]});
		const board = loadedBoard([{cellID: 1n, totalStake: 30n, numClaimants: 2}]);
		const {simulate, asked} = standInRule();
		const stakeOf = vi.fn(async (cellID: bigint) => (cellID === 1n ? 10n : 0n));

		const preview = createPlacementPreview({
			plan,
			board,
			identity: writable(PLAYER),
			simulate,
			stakeOf,
		});
		const values: unknown[] = [];
		const stop = preview.subscribe((v) => values.push(v));
		await flush();

		expect(asked[0].cells).toEqual([
			{cellID: 1n, totalStake: 30n, numClaimants: 2, playerStake: 10n},
			// A cell the board does not hold is an empty one, not a missing one.
			{cellID: 2n, totalStake: 0n, numClaimants: 0, playerStake: 0n},
		]);
		expect(asked[0].placements).toEqual([{cellID: 1n}, {cellID: 2n}]);
		expect(stakeOf).toHaveBeenCalledWith(1n, PLAYER_ID);

		const last = get(preview);
		expect(last.step).toBe('Ready');
		if (last.step !== 'Ready') throw new Error('unreachable');
		expect(last.result.get(1n)).toEqual({
			totalStake: 40n,
			numClaimants: 2,
			playerStake: 20n,
		});
		expect(last.result.get(2n)).toEqual({
			totalStake: 10n,
			numClaimants: 1,
			playerStake: 10n,
		});
		stop();
	});

	it('reads a player’s stake on a cell once per cycle', async () => {
		const plan = writable<LocalPlan>({planned: [1n]});
		const board = loadedBoard([]);
		const {simulate} = standInRule();
		const stakeOf = vi.fn(async () => 0n);
		const preview = createPlacementPreview({
			plan,
			board,
			identity: writable(PLAYER),
			simulate,
			stakeOf,
		});
		const stop = preview.subscribe(() => {});
		await flush();
		plan.set({planned: [1n, 2n]});
		await flush();
		plan.set({planned: [1n]});
		await flush();
		expect(stakeOf).toHaveBeenCalledTimes(2);

		// A new cycle may follow the player's own reveal: read again.
		board.set({step: 'Loaded', cycleNumber: 4, cells: new Map()});
		await flush();
		expect(stakeOf).toHaveBeenCalledTimes(3);
		stop();
	});

	it('asks nothing with no plan, no player, or no board', async () => {
		const {simulate} = standInRule();
		const stakeOf = vi.fn(async () => 0n);
		const plan = writable<LocalPlan>({planned: []});
		const identity = writable<typeof PLAYER | undefined>(PLAYER);
		const board = writable<
			OnchainStateValue<BoardState & {cycleNumber: number}>
		>({step: 'Unloaded'});
		const preview = createPlacementPreview({
			plan,
			board,
			identity,
			simulate,
			stakeOf,
		});
		const stop = preview.subscribe(() => {});
		plan.set({planned: [1n]});
		identity.set(undefined);
		board.set({step: 'Loaded', cycleNumber: 1, cells: new Map()});
		await flush();
		expect(simulate).not.toHaveBeenCalled();
		expect(get(preview)).toEqual({step: 'Idle'});
		stop();
	});
});

describe('withPreview', () => {
	it('attaches the preview only to the plan it was computed for', async () => {
		const plan = writable<LocalPlan>({planned: [1n]});
		const board = loadedBoard([]);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const {simulate: rule} = standInRule();
		const simulate = async (
			cells: readonly PlayerCell[],
			placements: readonly Placement[],
		) => {
			// The second plan's answer is held back, so the first one's is what
			// the store last had when the plan changed.
			if (placements.length === 2) await gate;
			return rule(cells, placements);
		};
		const preview = createPlacementPreview({
			plan,
			board,
			identity: writable(PLAYER),
			simulate,
			stakeOf: async () => 0n,
		});
		const drawn = withPreview(plan, preview);
		const stop = drawn.subscribe(() => {});
		await flush();
		expect(get(drawn).preview?.get(1n)?.totalStake).toBe(10n);

		plan.set({planned: [1n, 2n]});
		await flush();
		expect(get(drawn).planned).toEqual([1n, 2n]);
		expect(
			get(drawn).preview,
			'never the previous plan’s answer',
		).toBeUndefined();

		release();
		await flush();
		expect(get(drawn).preview?.get(2n)?.totalStake).toBe(10n);
		stop();
	});
});

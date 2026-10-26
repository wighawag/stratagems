/**
 * Clicks into planned moves, by stratagems' rules.
 *
 * WHAT A CLICK MAY PLAN is the contract's rule since step 10b (P1 of the plan):
 * a cell ALIVE at the cycle's start and owned by another player (or Evil) is
 * "already there" and a move onto it would be skipped, so it is not offered; a
 * dead cell, anyone's, is free; the player's own living cell may be re-placed.
 * "At the cycle's start" is the board as the indexer holds it: during the commit
 * phase no reveal of the cycle has landed, so that board IS the cycle's start.
 *
 * What is not here yet, and is step 6c's with the rest of stratagems' own UI:
 * the faction picker (the colour is the player's default faction, from their
 * address, as the legacy client's was), the land menu (removing a full-life
 * cell, which this refuses rather than guess), and the reasons a click was
 * refused.
 */
import {derived, get, type Readable} from 'svelte/store';
import {StratagemsContract, type ContractCell} from 'stratagems-common';
import type {SubmissionState, SubmissionStore} from '$lib/game/core/submission';
import type {OnchainStateStore, OnchainStateValue} from '$lib/game/core/seams';
import type {GameIdentity} from '$lib/game/identity';
import type {BoardState} from './board/indexed-board';
import type {Move} from './moves';
import {MAX_MOVES_PER_TURN} from './game-config';
import type {LocalPlan} from './view';

/** The player's default faction (1 to 5), as the legacy client derived it. */
export function defaultColorOf(player: `0x${string}`): number {
	return Number((BigInt(player) % 5n) + 1n);
}

export function isPlannable(state: SubmissionState<Move>): boolean {
	return (
		state.step === 'Idle' ||
		state.step === 'Planning' ||
		state.step === 'Revealed' ||
		state.step === 'Missed' ||
		(state.step === 'Error' && state.during === 'commit')
	);
}

function movesOf(state: SubmissionState<Move>): readonly Move[] {
	return 'actions' in state ? state.actions : [];
}

/**
 * Whether `player` may plan a coloured move on `position`, judged on `board` (the
 * cycle's start). Pure, so the rule is testable without a chain.
 */
export function canPlaceOn(params: {
	board: BoardState;
	position: bigint;
	player: `0x${string}`;
	maxLife: number;
}): boolean {
	const {board, position} = params;
	const key = position.toString();
	const raw: ContractCell | undefined = board.data.cells[key];
	if (!raw) return true;
	const simulation = new StratagemsContract(
		{
			cells: {[key]: {...raw}},
			owners: {},
			computedPoints: {},
		},
		params.maxLife,
	);
	const {updatedCell} = simulation.getUpdatedCell(position, board.cycleNumber);
	if (updatedCell.life === 0) return true;
	const owner = board.data.owners[key]?.toLowerCase();
	if (owner !== params.player.toLowerCase()) return false;
	// the player's own living cell: re-placed, except at full life, where the
	// only move is a removal and that is the land menu's (step 6c)
	return updatedCell.life < (params.maxLife);
}

export type PlanningStore = {
	plan: Readable<LocalPlan>;
	actions: Readable<readonly Move[]>;
	canPlan: Readable<boolean>;
	count: Readable<number>;
	maxActions: Readable<number | undefined>;
	atLimit: Readable<boolean>;
	/** Plan a move on the cell at x,y, or take back the one planned there. */
	toggle(position: bigint): void;
	clear(): void;
};

export function createPlanning(params: {
	submission: SubmissionStore<GameIdentity, Move>;
	maxOpenableActions: Readable<number | undefined>;
	onchainState: OnchainStateStore<BoardState>;
	identity: Readable<GameIdentity | undefined>;
	maxLife: number;
}): PlanningStore {
	const {submission, onchainState, identity} = params;

	const maxActions = derived(params.maxOpenableActions, ($max) =>
		$max === undefined
			? MAX_MOVES_PER_TURN
			: Math.min($max, MAX_MOVES_PER_TURN),
	);

	const actions = derived(submission, ($submission) => movesOf($submission));
	const plan = derived(
		[actions, identity],
		([$actions, $identity]): LocalPlan => ({
			planned: $actions,
			player: $identity,
		}),
	);
	const canPlan = derived(submission, ($submission) =>
		isPlannable($submission),
	);
	const count = derived(actions, ($actions) => $actions.length);
	const atLimit = derived(
		[count, maxActions],
		([$count, $max]) => $count >= $max,
	);

	function toggle(position: bigint) {
		if (!isPlannable(submission.value)) return;
		const player = get(identity);
		if (!player) return;
		const current = movesOf(submission.value);
		const without = current.filter((move) => move.position !== position);
		if (without.length !== current.length) {
			submission.plan(without);
			return;
		}
		if (current.length >= get(maxActions)) return;
		const board = get({subscribe: onchainState.subscribe}) as OnchainStateValue<BoardState>;
		if (board.step !== 'Loaded') return;
		if (!canPlaceOn({board, position, player, maxLife: params.maxLife})) return;
		submission.plan([...current, {position, color: defaultColorOf(player)}]);
	}

	function clear() {
		if (!isPlannable(submission.value)) return;
		submission.plan([]);
	}

	return {plan, actions, canPlan, count, maxActions, atLimit, toggle, clear};
}

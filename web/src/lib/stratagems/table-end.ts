/**
 * A TABLE'S END, FOR THE HUD (step L4, L4-18): its board's bounds, the stake a
 * seat takes, the live ranking by net gems, and once it has ended, the
 * settlement and the withdrawal.
 *
 * WHAT IS READ AND FROM WHERE. The roster, the end and the options come from
 * the framework's table store (`$lib/game/lobby/table`), polled already. The
 * members' reserves and collision credits, whether the table is settled, and
 * the recorded scores and winners are read from the table here, each time the
 * table store or the board moves. What the board still holds is valued by
 * `./score.ts`'s `valueAtEnd`, in the sandbox, when the board changes.
 *
 * ANYONE MAY SETTLE (the contract's rule), so the action is offered to every
 * member while cells are unsettled, batched to {@link SETTLE_BATCH}; the call
 * that settles the last cell records the scores. Withdrawing is the member's
 * own, and only once settled.
 */
import {derived, get, readable, writable, type Readable} from 'svelte/store';
import type {Abi} from 'viem';
import type {TableState, TableStore} from '$lib/game/lobby/table';
import type {OnchainStateValue} from '$lib/game/core/seams';
import type {BoardState} from './board/indexed-board';
import {
	decodeStratagemsOptions,
	SETTLE_BATCH,
	tableBoardOf,
	tableStakeOf,
	type StratagemsTableOptions,
} from './table';
import {
	netGemsOf,
	rankScores,
	settleBatches,
	unsettledPositions,
	valueAtEnd,
	type SimulatePoke,
	type TableScoreRow,
} from './score';
import {errorMessage, type WalletActionState, type WalletSend} from './wallet';

type Reader = {
	readContract(request: {
		address: `0x${string}`;
		abi: Abi;
		functionName: string;
		args?: readonly unknown[];
	}): Promise<unknown>;
};

/** The square a table's moves must land in, once it has started. */
export type TableBoard = {min: number; max: number; side: number};

export type TableEndState =
	| {step: 'Unavailable'}
	| {
			step: 'Loaded';
			options: StratagemsTableOptions;
			/** What a seat stakes, in token units. */
			stake: bigint;
			board?: TableBoard;
			started: boolean;
			ended: boolean;
			settled: boolean;
			/** Cells the board still holds a stake on. */
			unsettled: number;
			/** The ranking: live net gems until settled, then the recorded scores. */
			rows: readonly TableScoreRow[];
			/** Whether the live values have been computed for this board. */
			valued: boolean;
	  };

export type TableEnd = Readable<TableEndState> & {
	/** The square, for the planner and the renderer. */
	board: Readable<TableBoard | undefined>;
	/** The stake a seat takes, once the options are read (token units). */
	stake: Readable<bigint | undefined>;
	settling: Readable<WalletActionState>;
	withdrawing: Readable<WalletActionState>;
	/** Settle every unsettled cell, in batches; the last one finalises. */
	settle(): Promise<void>;
	/** Take this account's reserve out of the settled table. */
	withdraw(): Promise<void>;
	/** Read the table's reserves and scores again. */
	update(): Promise<void>;
	/**
	 * What `data` would pay each account once settled `maxLife` cycles after
	 * `cycleNumber` (`./score.ts`'s `valueAtEnd`, in this table's sandbox):
	 * what the live ranking values the board with, and what step L4's gate
	 * times in the browser.
	 */
	project(
		data: BoardState['data'],
		cycleNumber: number,
	): Promise<Map<string, bigint>>;
};

const addressOf = (player: bigint): `0x${string}` =>
	`0x${player.toString(16).padStart(40, '0')}`;

type Chain = {
	reserves: Map<string, bigint>;
	credits: Map<string, bigint>;
	settled: boolean;
	/** The contract's count of cells still holding a stake. */
	unsettled: number;
	scores?: {players: readonly bigint[]; scores: readonly bigint[]};
	winners: readonly bigint[];
};

export function createTableEnd(params: {
	publicClient: Reader;
	table: TableStore;
	contract: {address: `0x${string}`; abi: Abi};
	onchainState: Readable<OnchainStateValue<BoardState>>;
	maxLife: number;
	numTokensPerGems: bigint;
	simulate: SimulatePoke;
	send: WalletSend;
	/** Called after a settlement or a withdrawal lands. */
	onChanged?: () => void;
	/** Fold the board again now, rather than at the next poll. */
	refreshBoard?: () => Promise<void>;
	/** How long to wait for the board between two rounds of a settlement. */
	settleRetryMs?: number;
}): TableEnd {
	const {publicClient, table, contract} = params;
	const read = (functionName: string, args?: readonly unknown[]) =>
		publicClient.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName,
			...(args ? {args} : {}),
		});

	const chain = writable<Chain | undefined>(undefined);
	const settling = writable<WalletActionState>({step: 'Idle'});
	const withdrawing = writable<WalletActionState>({step: 'Idle'});

	const loaded = (state: TableState) =>
		state.step === 'Loaded' ? state : undefined;

	async function update() {
		const state = loaded(get(table));
		if (!state || !state.roster.started) return;
		const members = state.roster.members;
		try {
			const [reserves, credits, settled, unsettled] = await Promise.all([
				Promise.all(members.map((m) => read('getReserve', [m]))),
				Promise.all(members.map((m) => read('getCollisionCredit', [m]))),
				read('isSettled'),
				read('unsettledCells'),
			]);
			const next: Chain = {
				reserves: new Map(
					members.map((m, i) => [addressOf(m), reserves[i] as bigint]),
				),
				credits: new Map(
					members.map((m, i) => [addressOf(m), credits[i] as bigint]),
				),
				settled: settled as boolean,
				unsettled: Number(unsettled as bigint),
				winners: [],
			};
			if (next.settled) {
				const [[players, scores], winners] = (await Promise.all([
					read('getScores'),
					read('winners'),
				])) as [[readonly bigint[], readonly bigint[]], readonly bigint[]];
				next.scores = {players, scores};
				next.winners = winners;
			}
			chain.set(next);
		} catch {
			// the next poll tries again; a ranking stays as it was meanwhile
		}
	}

	// what the board still holds, valued as the end would value it
	const value = readable<
		{board: BoardState; value: Map<string, bigint>} | undefined
	>(undefined, (set) => {
		let generation = 0;
		return derived([params.onchainState, table], (x) => x).subscribe(
			([$board, $table]) => {
				const state = loaded($table);
				if ($board.step !== 'Loaded' || !state?.roster.started) return;
				const ended = state.roster.ended;
				const last = Number(state.roster.lastCycleNumber);
				const cycleNumber = ended ? last : $board.cycleNumber;
				const mine = ++generation;
				const board: BoardState = {
					data: $board.data,
					cycleNumber: $board.cycleNumber,
				};
				void valueAtEnd({
					data: $board.data,
					cycleNumber,
					maxLife: params.maxLife,
					numTokensPerGems: params.numTokensPerGems,
					simulate: params.simulate,
				})
					.then((v) => {
						if (mine === generation) set({board, value: v});
					})
					.catch(() => {});
			},
		);
	});

	const options = derived(table, ($table) => {
		const state = loaded($table);
		return state
			? decodeStratagemsOptions(state.roster.gameOptions)
			: undefined;
	});

	const board = derived([table, options], ([$table, $options]) => {
		const state = loaded($table);
		if (!state || !$options) return undefined;
		return tableBoardOf(state.roster.startedWith, $options);
	});

	const stake = derived(options, ($options) =>
		$options ? tableStakeOf($options, params.numTokensPerGems) : undefined,
	);

	const state = derived(
		[table, options, board, chain, value, params.onchainState],
		([$table, $options, $board, $chain, $value, $onchain]): TableEndState => {
			const roster = loaded($table)?.roster;
			if (!roster || !$options) return {step: 'Unavailable'};
			const stakeTokens = tableStakeOf($options, params.numTokensPerGems);
			const settled = $chain?.settled ?? false;
			let rows: TableScoreRow[] = [];
			if (settled && $chain?.scores) {
				rows = rankScores(
					$chain.scores.players.map((p, i) => ({
						player: addressOf(p),
						score: $chain.scores!.scores[i],
					})),
					$chain.winners.map(addressOf),
				);
			} else if ($chain) {
				rows = rankScores(
					roster.members.map((m) => {
						const player = addressOf(m);
						return {
							player,
							score: netGemsOf({
								reserve: $chain.reserves.get(player) ?? 0n,
								stake: stakeTokens,
								collisionCredit: $chain.credits.get(player) ?? 0n,
								valueAtEnd: $value?.value.get(player) ?? 0n,
							}),
						};
					}),
				);
			}
			// the contract's count, which a board still folding the last reveals
			// cannot be behind
			const unsettled =
				$chain?.unsettled ??
				($onchain.step === 'Loaded'
					? unsettledPositions($onchain.data).length
					: 0);
			return {
				step: 'Loaded',
				options: $options,
				stake: stakeTokens,
				board: $board,
				started: roster.started,
				ended: roster.ended,
				settled,
				unsettled,
				rows,
				valued: $value !== undefined,
			};
		},
	);

	/**
	 * THE POSITIONS COME FROM THE BOARD THIS BROWSER FOLDED, and the contract
	 * cannot list its cells, so a board still folding the last reveals would
	 * leave cells out (measured: the first two-browser run settled 3 of 4 and
	 * stopped short of the scores). So it settles in rounds: what the board
	 * lists, then the contract's count read back, and while cells remain, the
	 * board folded again and the cells not yet sent, until none is left.
	 */
	async function settle() {
		settling.set({step: 'Sending'});
		const sent = new Set<string>();
		const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
		try {
			for (let round = 0; round < 10; round++) {
				const $board = get(params.onchainState);
				const positions =
					$board.step === 'Loaded'
						? unsettledPositions($board.data).filter(
								(p) => !sent.has(p.toString()),
							)
						: [];
				const remaining = Number((await read('unsettledCells')) as bigint);
				if (remaining === 0 && (await read('isSettled'))) break;
				if (positions.length === 0 && remaining !== 0) {
					await params.refreshBoard?.();
					await pause(params.settleRetryMs ?? 1500);
					continue;
				}
				const batches = settleBatches(positions, SETTLE_BATCH);
				// an empty board still has to be finalised: one call with no cell
				for (const batch of batches.length === 0 ? [[]] : batches) {
					await params.send(
						{
							address: contract.address,
							abi: contract.abi,
							functionName: 'settle',
							args: [batch],
						},
						'The settlement',
					);
					for (const p of batch) sent.add(p.toString());
				}
			}
			settling.set({step: 'Idle'});
			await update();
			params.onChanged?.();
		} catch (error) {
			settling.set({step: 'Error', message: errorMessage(error)});
		}
	}

	async function withdraw() {
		withdrawing.set({step: 'Sending'});
		try {
			await params.send(
				{
					address: contract.address,
					abi: contract.abi,
					functionName: 'withdrawFromReserve',
					args: [2n ** 256n - 1n],
				},
				'The withdrawal',
			);
			withdrawing.set({step: 'Idle'});
			await update();
			params.onChanged?.();
		} catch (error) {
			withdrawing.set({step: 'Error', message: errorMessage(error)});
		}
	}

	// re-read whenever the table store or the board moves, while anyone listens
	const polled = readable<TableEndState>({step: 'Unavailable'}, (set) => {
		const stopState = state.subscribe(set);
		const stopTable = table.subscribe(() => void update());
		const stopBoard = params.onchainState.subscribe(() => void update());
		return () => {
			stopState();
			stopTable();
			stopBoard();
		};
	});

	return {
		subscribe: polled.subscribe,
		board,
		stake,
		settling: {subscribe: settling.subscribe},
		withdrawing: {subscribe: withdrawing.subscribe},
		settle,
		withdraw,
		update,
		project: (data, cycleNumber) =>
			valueAtEnd({
				data,
				cycleNumber,
				maxLife: params.maxLife,
				numTokensPerGems: params.numTokensPerGems,
				simulate: params.simulate,
			}),
	};
}

/** What the HUD says about a table's end. Pure. */
export type TableEndModel =
	| undefined
	| {
			/** One sentence: where the table is against its end. */
			status: string;
			/** The winners, once settled, as the HUD names them. */
			winners: readonly string[];
			/** Offer the settlement: ended, and cells still hold a stake. */
			canSettle: boolean;
			/** Offer the withdrawal: settled, and this account holds a reserve. */
			canWithdraw: boolean;
	  };

export function describeTableEnd(
	state: TableEndState,
	params: {
		viewer?: string;
		/** This account's reserve at the table, when read. */
		reserve?: bigint;
		/** How an address is shown. */
		label: (player: `0x${string}`) => string;
	},
): TableEndModel {
	if (state.step !== 'Loaded' || !state.started || !state.ended) {
		return undefined;
	}
	const viewer = params.viewer?.toLowerCase();
	const winners = state.rows
		.filter((row) => row.winner)
		.map((row) => (row.player === viewer ? 'you' : params.label(row.player)));
	if (!state.settled) {
		return {
			status:
				state.unsettled > 0
					? `The game has ended. ${state.unsettled} cells still hold gems: settling pays them out and names the winner.`
					: 'The game has ended. Settling records the scores and names the winner.',
			winners: [],
			canSettle: true,
			canWithdraw: false,
		};
	}
	return {
		status:
			winners.length > 1
				? `Settled. A tie between ${winners.join(' and ')}.`
				: `Settled. The winner: ${winners[0] ?? 'nobody'}.`,
		winners,
		canSettle: false,
		canWithdraw: (params.reserve ?? 0n) > 0n,
	};
}

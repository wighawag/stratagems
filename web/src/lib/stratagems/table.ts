/**
 * STRATAGEMS' TABLES: where its factory is, and what a table's deployment
 * record is (`$lib/game/lobby/table`'s `TableLobby`, exported as `lobby` by
 * `./game.ts`). Step L2 of work/plans/join-template-commit-reveal.md, PL2-5.
 *
 * A table is the world's record with `Stratagems` at the table's address: the
 * ABI of the implementation it is a clone of (the world's routes plus the
 * base's `CommitRevealLobby`), and the config every table plays by, which
 * `contracts/deploy/021_deploy_tables.ts` records on the factory. Three more
 * names are swapped, because each is a contract of its own that the world's
 * record points at the WORLD'S:
 *
 * - `StratagemsSimulation`: the table's, built with the table's config, so the
 *   preview runs the rules a table plays by;
 * - `GemsGenerator`: `NoRewards`, so the indexer folds no points (a table has
 *   none, by design: PL2-2);
 * - the publication: none, which is the context's to skip (`createIndexedBoard`
 *   at a table), since a table's record has the world's name.
 *
 * Everything else (the tokens, the distributor) is the world's.
 */
import type {TypedDeployments} from '$lib/deployments-store';
import type {TableLobby, TableOptions} from '$lib/game/lobby/table';

type Contract = {address: `0x${string}`; abi: unknown; linkedData?: unknown};

function contractNamed(deployments: TypedDeployments, name: string): Contract {
	const contract = (
		deployments.contracts as unknown as Record<string, Contract>
	)[name];
	if (!contract) {
		throw new Error(
			`this deployment has no ${name}: its tables are deployed by contracts/deploy/021_deploy_tables.ts`,
		);
	}
	return contract;
}

/**
 * Whether `name` is one of the contracts `021_deploy_tables.ts` deploys, which
 * the offline world does not (an in-tab chain has nobody to invite: PL2-3).
 */
export function isTableContract(name: string): boolean {
	return name.startsWith('StratagemsTable') || name === 'NoRewards';
}

/** Whether this deployment has tables at all (the offline world has none). */
export function hasTables(deployments: TypedDeployments): boolean {
	return 'StratagemsTableFactory' in deployments.contracts;
}

// ---------------------------------------------------------------------------
// A TABLE'S OPTIONS (step L4, L4-23 to L4-25): the stake of a seat and the gap
// ---------------------------------------------------------------------------

/**
 * WHAT A TABLE'S CONTRACT READS, `{uint32 stakeGems; uint16 gapPercent}` in
 * the low 48 bits of the base's opaque `gameOptions`, the rest zero
 * (`UsingStratagemsTable._tableOptions`, which refuses anything else, and a
 * stake of zero). A seat stakes exactly `stakeGems` gems; the board is a square
 * sized to every seat's gems and the gap (see {@link tableBoardOf}).
 */
export type StratagemsTableOptions = {stakeGems: number; gapPercent: number};

/** The defaults the creation form offers (L4-25, to revisit after a played `lan` table). */
export const DEFAULT_TABLE_STAKE_GEMS = 10;
export const DEFAULT_TABLE_GAP_PERCENT = 50;

export function encodeStratagemsOptions(
	options: StratagemsTableOptions,
): `0x${string}` {
	const raw = (BigInt(options.gapPercent) << 32n) | BigInt(options.stakeGems);
	return `0x${raw.toString(16).padStart(64, '0')}`;
}

/** The options a table was created with, or nothing if its contract would refuse them. */
export function decodeStratagemsOptions(
	gameOptions: `0x${string}`,
): StratagemsTableOptions | undefined {
	let raw: bigint;
	try {
		raw = BigInt(gameOptions);
	} catch {
		return undefined;
	}
	const stakeGems = Number(raw & 0xffffffffn);
	const gapPercent = Number((raw >> 32n) & 0xffffn);
	if (raw >> 48n !== 0n || stakeGems === 0) return undefined;
	return {stakeGems, gapPercent};
}

/**
 * THE BOARD A TABLE PLAYS ON, as its contract computes it
 * (`UsingStratagemsTable._boardSide`): a square centred on the origin, of
 * `ceil(sqrt(ceil(startedWith * stakeGems * (100 + gap) / 100)))` cells a
 * side, x and y from `-floor(side / 2)` to `side - 1 - floor(side / 2)`.
 * Nothing before the start, when nobody knows how many will play.
 */
export function tableBoardOf(
	startedWith: number,
	options: StratagemsTableOptions,
): {min: number; max: number; side: number} | undefined {
	if (startedWith <= 0) return undefined;
	const cells = Math.ceil(
		(startedWith * options.stakeGems * (100 + options.gapPercent)) / 100,
	);
	let side = Math.floor(Math.sqrt(cells));
	while (side * side < cells) side += 1;
	while (side > 0 && (side - 1) * (side - 1) >= cells) side -= 1;
	const min = -Math.floor(side / 2);
	return {min, max: min + side - 1, side};
}

/** Whether a cell is on a table's board; anywhere, when there is no bound. */
export function onTableBoard(
	board: {min: number; max: number} | undefined,
	x: number,
	y: number,
): boolean {
	return (
		board === undefined ||
		(x >= board.min && x <= board.max && y >= board.min && y <= board.max)
	);
}

/** The stake of a seat at a table, in token units. */
export function tableStakeOf(
	options: StratagemsTableOptions,
	numTokensPerGems: bigint,
): bigint {
	return BigInt(options.stakeGems) * numTokensPerGems;
}

/** What the lobby asks of a table's creator, and how it says a table's. */
export const STRATAGEMS_TABLE_OPTIONS: TableOptions = {
	fields: [
		{
			id: 'stakeGems',
			label: 'Gems a seat stakes',
			min: 1,
			max: 1000,
			default: DEFAULT_TABLE_STAKE_GEMS,
			unit: 'gems',
		},
		{
			id: 'gapPercent',
			label: 'Room on the board beyond one cell a gem',
			min: 0,
			max: 400,
			default: DEFAULT_TABLE_GAP_PERCENT,
			unit: '%',
		},
	],
	encode: (values) =>
		encodeStratagemsOptions({
			stakeGems: values.stakeGems,
			gapPercent: values.gapPercent,
		}),
	describe(gameOptions) {
		const options = decodeStratagemsOptions(gameOptions);
		if (!options) return [];
		return [
			{label: 'Stake a seat', value: `${options.stakeGems} gems`},
			{label: 'Board', value: `${options.gapPercent}% beyond a cell a gem`},
		];
	},
};

/**
 * How many cells one settlement transaction settles: 51,753 gas a cell
 * measured on 16 cells half of them dying (`Stratagems.table.test.ts`), so a
 * batch of 64 is about 3.3 M, under half the chunk's declared 7 M even if
 * every cell pays four killers.
 */
export const SETTLE_BATCH = 64;

export const stratagemsLobby: TableLobby = {
	options: STRATAGEMS_TABLE_OPTIONS,
	factory: (deployments) =>
		contractNamed(deployments, 'StratagemsTableFactory'),
	deploymentsAt(deployments, table) {
		const implementation = contractNamed(
			deployments,
			'StratagemsTableImplementation',
		);
		const factory = contractNamed(deployments, 'StratagemsTableFactory');
		return {
			...deployments,
			contracts: {
				...deployments.contracts,
				Stratagems: {
					...implementation,
					address: table,
					linkedData: factory.linkedData,
				},
				StratagemsSimulation: contractNamed(
					deployments,
					'StratagemsTableSimulation',
				),
				GemsGenerator: contractNamed(deployments, 'NoRewards'),
			},
		} as unknown as TypedDeployments;
	},
};

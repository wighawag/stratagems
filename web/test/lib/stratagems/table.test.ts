/**
 * A TABLE'S RECORD AND ITS STAKE (step L2 of
 * work/plans/join-template-commit-reveal.md, PL2-1 and PL2-5).
 */
import {describe, expect, it} from 'vitest';
import type {TypedDeployments} from '$lib/deployments-store';
import {
	decodeStratagemsOptions,
	encodeStratagemsOptions,
	hasTables,
	onTableBoard,
	STRATAGEMS_TABLE_OPTIONS,
	stratagemsLobby,
	tableBoardOf,
	tableStakeOf,
} from '$lib/stratagems/table';
import {createStakeAcquisition} from '$lib/stratagems/stake';
import {resolveStratagemsConfig} from '$lib/stratagems/game-config';
import generated from '$lib/deployments';

const deployments = generated as unknown as TypedDeployments;
const TABLE = '0x00000000000000000000000000000000000ab1e5' as const;
const contracts = deployments.contracts as unknown as Record<
	string,
	{address: string; abi: unknown; linkedData?: Record<string, unknown>}
>;

describe("a table's record", () => {
	const atTable = stratagemsLobby.deploymentsAt(deployments, TABLE);
	const table = atTable.contracts as unknown as typeof contracts;

	it('puts Stratagems at the table, with the implementation ABI and the factory config', () => {
		expect(hasTables(deployments)).toBe(true);
		expect(stratagemsLobby.factory(deployments).address).toBe(
			contracts.StratagemsTableFactory.address,
		);
		expect(table.Stratagems.address).toBe(TABLE);
		expect(table.Stratagems.abi).toBe(
			contracts.StratagemsTableImplementation.abi,
		);
		expect(table.Stratagems.linkedData).toBe(
			contracts.StratagemsTableFactory.linkedData,
		);
		// the table's rules: early advance and its own clock
		const config = resolveStratagemsConfig(atTable);
		expect(config.cycle.policy).toBe('hybrid');
		expect(config.cycle.startTime).toBe(1_735_689_600);
	});

	it("swaps the simulation and the generator for the table's, and keeps the world's tokens", () => {
		expect(table.StratagemsSimulation.address).toBe(
			contracts.StratagemsTableSimulation.address,
		);
		expect(table.GemsGenerator.address).toBe(contracts.NoRewards.address);
		expect(table.TestTokens.address).toBe(contracts.TestTokens.address);
		// the world's record is untouched
		expect(contracts.Stratagems.address).not.toBe(TABLE);
	});
});

describe('the stake (PL2-1)', () => {
	it('at a table, asks the rail for an allowance of exactly the stake, on the tokens, for the table', () => {
		const atTable = stratagemsLobby.deploymentsAt(deployments, TABLE);
		const config = resolveStratagemsConfig(atTable);
		const acquisition = createStakeAcquisition({
			config,
			deployments: atTable,
			atTable: true,
		});
		expect(acquisition.address).toBe(TABLE);
		expect(acquisition.allowance).toEqual({
			token: config.tokenAddress,
			amount: config.stakeAmount,
		});
		expect(acquisition.allowance?.token).toBe(contracts.TestTokens.address);
	});

	it('in the world, asks for none: the world holds a global approval', () => {
		const config = resolveStratagemsConfig(deployments);
		const acquisition = createStakeAcquisition({config, deployments});
		expect(acquisition.allowance).toBeUndefined();
	});
});

describe("a table's options and board (step L4)", () => {
	it('encodes the stake and the gap where the contract reads them, and back', () => {
		const options = {stakeGems: 10, gapPercent: 50};
		const encoded = encodeStratagemsOptions(options);
		expect(encoded).toBe(`0x${'0'.repeat(54)}320000000a`);
		expect(decodeStratagemsOptions(encoded)).toEqual(options);
		expect(
			STRATAGEMS_TABLE_OPTIONS.encode({stakeGems: 10, gapPercent: 50}),
		).toBe(encoded);
		// what the contract refuses, the client does not read
		expect(decodeStratagemsOptions(`0x${'0'.repeat(64)}`)).toBeUndefined();
		expect(decodeStratagemsOptions(`0x01${'0'.repeat(62)}`)).toBeUndefined();
		expect(STRATAGEMS_TABLE_OPTIONS.describe(encoded)).toEqual([
			{label: 'Stake a seat', value: '10 gems'},
			{label: 'Board', value: '50% beyond a cell a gem'},
		]);
		expect(tableStakeOf(options, 10n ** 18n)).toBe(10n * 10n ** 18n);
	});

	it('sizes the board as the contract does, for 2 to 8 seats and gaps of 0 and 50', () => {
		// the contract's answers, from `Stratagems.table.test.ts` (10 gems a seat)
		const side = (seats: number, gap: number) =>
			Math.ceil(Math.sqrt(Math.ceil((seats * 10 * (100 + gap)) / 100)));
		for (let seats = 2; seats <= 8; seats++) {
			for (const gap of [0, 50]) {
				const board = tableBoardOf(seats, {stakeGems: 10, gapPercent: gap})!;
				expect(board.side, `${seats} seats, ${gap}%`).toBe(side(seats, gap));
				expect(board.min).toBe(-Math.floor(board.side / 2));
				expect(board.max - board.min + 1).toBe(board.side);
			}
		}
		// exactly a cell a gem on a square
		expect(tableBoardOf(2, {stakeGems: 8, gapPercent: 0})).toEqual({
			min: -2,
			max: 1,
			side: 4,
		});
		expect(tableBoardOf(0, {stakeGems: 8, gapPercent: 0})).toBeUndefined();
		expect(onTableBoard({min: -2, max: 1}, 1, -2)).toBe(true);
		expect(onTableBoard({min: -2, max: 1}, 2, 0)).toBe(false);
		expect(onTableBoard(undefined, 1000, 0)).toBe(true);
	});

	it('asks the lobby for the stake and the gap, at their defaults', () => {
		expect(
			stratagemsLobby.options?.fields.map((f) => [f.id, f.default]),
		).toEqual([
			['stakeGems', 10],
			['gapPercent', 50],
		]);
	});

	it("stakes the table's own amount once it is read", () => {
		const atTable = stratagemsLobby.deploymentsAt(deployments, TABLE);
		const config = resolveStratagemsConfig(atTable);
		let stake: bigint | undefined;
		const acquisition = createStakeAcquisition({
			config,
			deployments: atTable,
			atTable: true,
			stakeAmount: () => stake,
		});
		expect(acquisition.allowance?.amount).toBe(config.stakeAmount);
		stake = 10n * config.numTokensPerGems;
		expect(acquisition.allowance?.amount).toBe(stake);
		const request = acquisition.request({
			owner: TABLE,
			stipendTo: undefined,
			stipend: 0n,
		} as never);
		expect((request.args as unknown[])[1]).toBe(stake);
	});
});

/**
 * A TABLE'S RECORD AND ITS STAKE (step L2 of
 * work/plans/join-template-commit-reveal.md, PL2-1 and PL2-5).
 */
import {describe, expect, it} from 'vitest';
import type {TypedDeployments} from '$lib/deployments-store';
import {stratagemsLobby, hasTables} from '$lib/stratagems/table';
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

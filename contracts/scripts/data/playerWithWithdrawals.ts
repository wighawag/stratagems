import contractsInfo from './contracts.js';
import hre from 'hardhat';
import {Color} from 'stratagems-common';

import type {EntityProcessor} from '@etherfold/processor-entities';
import {loadEnvironmentFromHardhat} from '../../rocketh/environment.js';
import {indexInProcess} from '../../utils/indexer.js';

export type Data = {
	players: {
		[address: `0x${string}`]: {moves: {position: bigint; color: number}[]};
	};
};

type StratagemsABI = (typeof contractsInfo.contracts)['Stratagems']['abi'];

/** Fixed width, so a listing's id order is the numeric one. */
const wide = (value: number | bigint) => String(value).padStart(12, '0');

/**
 * Every move of colour `None` a player revealed (a withdrawal), in the order
 * revealed: one row per move, keyed by the player and the move's arrival.
 */
const WithdrawalsProcessor: EntityProcessor<StratagemsABI> = {
	entities: [{name: 'withdrawal', id: ['player', 'ordinal'], fields: {position: 'text', color: 'integer'}}],
	onCommitmentRevealed(state, event) {
		const player = event.args.player.toLowerCase();
		event.args.moves.forEach((move, index) => {
			if (move.color == Color.None) {
				state.set(
					'withdrawal',
					{player, ordinal: `${wide(event.blockNumber)}:${wide(event.logIndex)}:${wide(index)}`},
					{position: move.position.toString(), color: move.color},
				);
			}
		});
	},
};

export async function indexPlayersWithWithdrawals(): Promise<Data> {
	const env = await loadEnvironmentFromHardhat({hre});
	const Stratagems = contractsInfo.contracts['Stratagems'];
	const indexed = await indexInProcess({
		processor: WithdrawalsProcessor,
		provider: env.network.provider,
		source: {
			chainId: String(contractsInfo.chain.id),
			genesisHash: contractsInfo.chain.genesisHash as `0x${string}`,
			contracts: [{abi: Stratagems.abi, address: Stratagems.address, startBlock: Stratagems.startBlock}],
		},
		db: `file:.data/withdrawals-${contractsInfo.name}.db`,
	});
	try {
		const {data, errors} = await indexed.execute({
			query: `{ withdrawal(first: 100000, orderBy: {field: ordinal, direction: asc}) { player position color } }`,
		});
		if (errors) throw new Error(errors[0].message);
		const players: Data['players'] = {};
		for (const row of (data as {withdrawal: {player: `0x${string}`; position: string; color: number}[]}).withdrawal) {
			(players[row.player] ??= {moves: []}).moves.push({position: BigInt(row.position), color: Number(row.color)});
		}
		return {players};
	} finally {
		indexed.close();
	}
}

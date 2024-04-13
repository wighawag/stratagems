import {createIndexerState} from 'ethereum-indexer-browser';
import {keepStateOnFile, keepStreamOnFile} from 'ethereum-indexer-fs';
import contractsInfo from './contracts';
import hre from 'hardhat';
import {Color} from 'stratagems-common';

import type {MergedAbis, JSProcessor} from 'ethereum-indexer-js-processor';
import {fromJSProcessor} from 'ethereum-indexer-js-processor';
import {loadEnvironmentFromHardhat} from 'hardhat-rocketh/helpers';

export type Data = {
	players: {
		[address: `0x${string}`]: {moves: any[]};
	};
};

type ContractsABI = MergedAbis<typeof contractsInfo.contracts>;

const StratagemsIndexerProcessor: JSProcessor<ContractsABI, Data> = {
	version: '6',
	construct(): Data {
		return {
			players: {},
		};
	},
	onCommitmentRevealed(state, event) {
		const playerAddress = event.args.player.toLowerCase();
		for (const move of event.args.moves) {
			console.log(move.color, Color.None);
			if (move.color == Color.None) {
				const player = (state.players[playerAddress] = state.players[playerAddress] || {
					moves: [],
				});
				player.moves.push(move);
			}
		}
	},
};

const createProcessor = fromJSProcessor(() => StratagemsIndexerProcessor);

export const processor = createProcessor();
export const {state, init, indexToLatest} = createIndexerState(processor, {
	keepState: keepStateOnFile('.data', 'playerWithWithdrawals') as any, // TODO types
	keepStream: keepStreamOnFile('.data', 'stratagems'),
});

export async function indexPlayersWithWithdrawals() {
	const env = await loadEnvironmentFromHardhat({hre}, {useChainIdOfForkedNetwork: true});
	await init({
		provider: env.network.provider,
		source: {
			chainId: contractsInfo.chainId,
			contracts: Object.keys(contractsInfo.contracts).map((name) => (contractsInfo as any).contracts[name]),
			genesisHash: contractsInfo.genesisHash,
		},
	});
	await indexToLatest();
	return state.$state;
}

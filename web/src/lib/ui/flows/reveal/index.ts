import {get, writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '..';
import {accountData, contracts} from '$lib/web3';
import {prepareCommitment, zeroBytes24} from 'stratagems-common';
import {localMoveToContractMove, type CommitMetadata, type RevealMetadata} from '$lib/web3/account-data';

export type RevealState = {};

export type RevealFlow = Flow<RevealState>;

export async function startReveal(commitTx: `0x${string}`, data: CommitMetadata) {
	await contracts.execute(async ({contracts, account, connection}) => {
		const steps: Step<RevealState>[] = [];

		const moves = data.localMoves.map(localMoveToContractMove);
		const {hash} = prepareCommitment(moves, data.secret);
		const currentCommitment = await contracts.Stratagems.read.getCommitment([account.address]);

		if (currentCommitment.hash != hash) {
			return steps;
		}

		const txStep = {
			title: 'transaction',
			action: 'OK',
			description: `commit your moves`,
			execute: async (state: RevealState) => {
				const revealMetadata: RevealMetadata = {
					type: 'reveal',
					commitTx,
				};
				connection.provider.setNextMetadata(revealMetadata);
				// address player,
				// bytes32 secret,
				// Move[] calldata moves,
				// bytes24 furtherMoves,
				// bool useReserve
				await contracts.Stratagems.write.resolve([account.address, data.secret, moves, zeroBytes24, true]);
				return state;
			},
		};
		steps.push(txStep);

		const flow: RevealFlow = {
			type: 'reveal',
			currentStepIndex: writable(0),
			state: writable({}),
			steps,
		};
		currentFlow.start(flow);
	});
}

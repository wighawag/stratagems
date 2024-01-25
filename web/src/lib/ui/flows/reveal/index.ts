import {writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '..';
import {contracts} from '$lib/blockchain/connection';
import {prepareCommitment, zeroBytes24} from 'stratagems-common';
import {zeroAddress} from 'viem';
import {localMoveToContractMove, type CommitMetadata} from '$lib/account/account-data';
import type {RevealMetadata} from '$lib/account/base';

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
			description: `reveal your moves`,
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
				await contracts.Stratagems.write.reveal([account.address, data.secret, moves, zeroBytes24, true, zeroAddress]);
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

export async function startAcknowledgFailedReveal(commitTx: `0x${string}`, data: CommitMetadata) {
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
			description: `acknowledge failure to reveal your moves`,
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
				await contracts.Stratagems.write.acknowledgeMissedReveal([account.address, data.secret, moves, zeroBytes24]);
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

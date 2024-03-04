import {writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '../flow';
import {contracts} from '$lib/blockchain/connection';
import {prepareCommitment, zeroBytes24} from 'stratagems-common';
import {zeroAddress} from 'viem';
import {localMoveToContractMove, type CommitMetadata} from '$lib/account/account-data';
import type {RevealMetadata} from '$lib/account/base';

export type RevealState = {};

export type RevealFlow = Flow<RevealState>;

export async function startReveal(commitTx: `0x${string}`, data: CommitMetadata) {
	await contracts.execute(async ({client, network: {contracts}, account, connection}) => {
		const steps: Step<RevealState>[] = [];
		const {Stratagems} = contracts;

		const moves = data.localMoves.map(localMoveToContractMove);
		const {hash} = prepareCommitment(moves, data.secret);
		const currentCommitment = await client.public.readContract({
			...Stratagems,
			functionName: 'getCommitment',
			args: [account.address],
		});

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
				await client.wallet.writeContract({
					...Stratagems,
					functionName: 'reveal',
					args: [account.address, data.secret, moves, zeroBytes24, true, zeroAddress],
				});
				return {newState: state};
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
	await contracts.execute(async ({client, network: {contracts}, account, connection}) => {
		const {Stratagems} = contracts;
		const steps: Step<RevealState>[] = [];

		const moves = data.localMoves.map(localMoveToContractMove);
		const {hash} = prepareCommitment(moves, data.secret);
		const currentCommitment = await client.public.readContract({
			...Stratagems,
			functionName: 'getCommitment',
			args: [account.address],
		});

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
				await client.wallet.writeContract({
					...Stratagems,
					functionName: 'acknowledgeMissedReveal',
					args: [account.address, data.secret, moves, zeroBytes24],
				});
				return {newState: state};
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

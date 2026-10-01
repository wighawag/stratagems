import {get, writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '../flow';
import {viemClient} from '$lib/blockchain/connection';
import type {CommitCancelMetadata} from '$lib/account/base';
import {epoch} from '$lib/state/Epoch';

export type CommitCancelState = {};

export type CommitCancelFlow = Flow<CommitCancelState>;

export async function startCancellingCommitment() {
	await viemClient.execute(async ({client, network: {contracts}, account, connection}) => {
		const {Stratagems} = contracts;
		const steps: Step<CommitCancelState>[] = [];

		const epochNumber = get(epoch);

		const txStep = {
			title: 'Cancelling Commitment',
			action: 'OK',
			description: `Cancel your previous commitment`,
			execute: async (state: CommitCancelState) => {
				const commitCancelMetadata: CommitCancelMetadata = {
					type: 'commit-cancel',
					epoch: epochNumber,
				};
				connection.provider.setNextMetadata(commitCancelMetadata);
				await client.wallet.writeContract({
					...Stratagems,
					functionName: 'cancelCommitment',
				});
				return {newState: state};
			},
		};
		steps.push(txStep);

		const flow: CommitCancelFlow = {
			type: 'commit-cancel',
			currentStepIndex: writable(0),
			state: writable({}),
			steps,
		};
		currentFlow.start(flow);
	});
}

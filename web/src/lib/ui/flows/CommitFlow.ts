import {get, writable, type Subscriber, type Unsubscriber, type Writable} from 'svelte/store';
import {actionState, localMoveToContractMove} from '$lib/action/ActionState';
import {contracts} from '$lib/web3';
import {prepareCommitment, zeroBytes32} from 'stratagems-common';

export type CommitFlowData = {
	state?: 'requireConfirmation';
};

export class CommitFlow {
	store: Writable<CommitFlowData>;
	$store: CommitFlowData;

	constructor() {
		this.$store = {};
		this.store = writable(this.$store);
	}

	subscribe(run: Subscriber<CommitFlowData>, invalidate?: (value?: CommitFlowData) => void): Unsubscriber {
		return this.store.subscribe(run, invalidate);
	}

	requireConfirmation() {
		this.$store.state = 'requireConfirmation';
		this.store.set(this.$store);
	}

	cancel() {
		this.$store.state = undefined;
		this.store.set(this.$store);
	}

	confirm() {
		contracts.execute(async ({contracts, account}) => {
			const actions = get(actionState);
			// TODO use signing key + nonce to generate secret deterninisticaly
			const secret = '0x0000000000000000000000000000000000000000000000000000000000000000';
			const {hash, moves} = prepareCommitment(actions.map(localMoveToContractMove), secret);
			await contracts.Stratagems.write.makeCommitmentWithExtraReserve(
				[hash, moves.length, {deadline: 0n, value: 0n, v: 0, r: zeroBytes32, s: zeroBytes32}],
				{account: account.address},
			);
		});
	}
}

export const commitFlow = new CommitFlow();

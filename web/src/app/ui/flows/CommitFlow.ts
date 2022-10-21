import {get, writable, type Subscriber, type Unsubscriber, type Writable} from 'sveltore';
import {defaultAbiCoder, ParamType} from '@ethersproject/abi';
import {keccak256} from '@ethersproject/keccak256';
import {actionState} from '$app/state/ActionState';
import {flow} from '$app/blockchain/wallet';

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
		flow.execute(async (contracts) => {
			const actions = get(actionState);
			const moves = actions;

			// TODO use signing key + nonce to generate secret deterninisticaly
			const secret = '0x0000000000000000000000000000000000000000000000000000000000000000';
			const commitmentHash = keccak256(
				defaultAbiCoder.encode(
					[
						'bytes32',
						ParamType.from({
							type: 'tuple[]',
							components: [
								{
									name: 'position',
									type: 'uint64',
								},
								{
									name: 'color',
									type: 'uint8',
								},
							],
						}),
					],
					[secret, moves]
				)
			);
			const game = contracts.Game;
			// await game.makeCommitmentWithExtraReserve(
			// 	commitmentHash,
			// 	actions.length,
			// 	permit || {
			// 		value: 0,
			// 		deadline: 0,
			// 		v: 0,
			// 		r: constants.HashZero,
			// 		s: constants.HashZero,
			// 	}
			// );
		});
	}
}

export const commitFlow = new CommitFlow();

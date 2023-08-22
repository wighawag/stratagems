import {get, writable, type Subscriber, type Unsubscriber, type Writable} from 'svelte/store';
import {actionState, localMoveToContractMove} from '$lib/action/ActionState';
import {contracts} from '$lib/web3';
import {prepareCommitment, zeroBytes32} from 'stratagems-common';

export type CommitFlowData = {
	state?: 'idle' | 'requireConfirmation' | 'permit' | 'tx' | 'fuzd' | 'complete';
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

	async confirm() {
		await contracts.execute(async ({contracts, account, connection}) => {
			this.$store.state = 'permit';
			this.store.set(this.$store);
			try {
				await connection.provider.request({
					method: 'eth_signTypedData_v4',
					params: [
						account.address,
						{
							domain: {
								chainId: 31337,
								name: 'Tokens',
								verifyingContract: contracts.TestTokens.address,
							},
							types: {
								Permit: [
									{name: 'owner', type: 'address'},
									{name: 'spender', type: 'address'},
									{name: 'value', type: 'uint256'},
									{name: 'nonce', type: 'uint256'},
									{name: 'deadline', type: 'uint256'},
								],
							},
							primaryType: 'Permit',
							message: {
								owner: account.address,
								spender: contracts.TestTokens.address,
								value: 1,
								nonce: 0,
								deadline: 0,
							},
						},
					],
				});
			} catch (e: any) {
				this.$store.state = 'requireConfirmation';
				this.store.set(this.$store);
			}
			this.$store.state = 'tx';
			this.store.set(this.$store);
		});
		// contracts.execute(async ({contracts, account}) => {
		// 	const actions = get(actionState);
		// 	// TODO use signing key + nonce to generate secret deterninisticaly
		// 	const secret = '0x0000000000000000000000000000000000000000000000000000000000000000';
		// 	const {hash, moves} = prepareCommitment(actions.map(localMoveToContractMove), secret);
		// 	await contracts.Stratagems.write.makeCommitmentWithExtraReserve(
		// 		[hash, moves.length, {deadline: 0n, value: 0n, v: 0, r: zeroBytes32, s: zeroBytes32}],
		// 		{account: account.address},
		// 	);
		// });
	}
}

export const commitFlow = new CommitFlow();

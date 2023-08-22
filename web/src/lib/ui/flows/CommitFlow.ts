import {get, writable, type Subscriber, type Unsubscriber, type Writable} from 'svelte/store';
import {actionState, localMoveToContractMove} from '$lib/action/ActionState';
import {contracts} from '$lib/web3';
import {prepareCommitment, zeroBytes32} from 'stratagems-common';
import {initialContractsInfos} from '$lib/config';
import {hexToSignature, zeroAddress} from 'viem';

export type CommitFlowData = {
	state: 'idle' | 'requireConfirmation' | 'permit' | 'tx' | 'fuzd' | 'complete';
	// requirePermitSignature: boolean;
	permitSignature?: `0x${string}`;
};

export class CommitFlow {
	store: Writable<CommitFlowData>;
	$store: CommitFlowData;

	constructor() {
		this.$store = {
			state: 'idle',
			// requirePermitSignature: false,
		};
		this.store = writable(this.$store);
	}

	subscribe(run: Subscriber<CommitFlowData>, invalidate?: (value?: CommitFlowData) => void): Unsubscriber {
		return this.store.subscribe(run, invalidate);
	}

	requireConfirmation(amount: bigint) {
		this.$store.state = 'requireConfirmation';
		this.store.set(this.$store);
	}

	cancel() {
		this.$store.state = 'idle';
		this.$store.permitSignature = undefined;
		this.store.set(this.$store);
	}

	async confirm() {
		await contracts.execute(async ({contracts, account, connection}) => {
			const actions = get(actionState);
			const numActions = actions.length;
			const tokenNeeded =
				BigInt(initialContractsInfos.contracts.Stratagems.linkedData.numTokensPerGems.slice(0, -1)) *
				BigInt(numActions);

			const chainId = parseInt(initialContractsInfos.chainId);
			const tokenInReserve = await contracts.Stratagems.read.getTokensInReserve([account.address]);

			// TODO extra token to put in reserver
			const amountToAdd = tokenNeeded > tokenInReserve ? tokenNeeded - tokenInReserve : 0n;
			this.$store.state = 'permit';
			this.store.set(this.$store);
			if ((initialContractsInfos.contracts.Stratagems.linkedData.tokens as unknown) !== zeroAddress) {
				if (amountToAdd > 0) {
					const nonce = Number(await contracts.TestTokens.read.nonces([account.address]));

					// const domain = await contracts.TestTokens.read.eip712Domain();
					try {
						const permit = {
							domain: {
								name: 'Tokens',
								chainId,
								verifyingContract: contracts.TestTokens.address,
							},
							types: {
								EIP712Domain: [
									{
										name: 'name',
										type: 'string',
									},
									{
										name: 'chainId',
										type: 'uint256',
									},
									{
										name: 'verifyingContract',
										type: 'address',
									},
								],
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
								spender: contracts.Stratagems.address,
								value: amountToAdd.toString(),
								nonce,
								deadline: 0,
							},
						};
						const signature = await connection.provider.request({
							method: 'eth_signTypedData_v4',
							//JSON.stringify(
							params: [account.address, permit],
							// ),
						});

						// 0x9c44b7e38020788fc1fc0e7ecb444662b6050678ed8e4ea56c253a55d83cc5cf4b6f581bd537e15a2421fa0d055418610a5c1917661354907b0d3b2539559ff21c
						// 0x9c44b7e38020788fc1fc0e7ecb444662b6050678ed8e4ea56c253a55d83cc5cf4b6f581bd537e15a2421fa0d055418610a5c1917661354907b0d3b2539559ff21c
						console.log({signature});

						const {v, r, s} = hexToSignature(signature);

						this.$store.state = 'tx';
						this.store.set(this.$store);

						const secret = '0x0000000000000000000000000000000000000000000000000000000000000000';
						const {hash, moves} = prepareCommitment(actions.map(localMoveToContractMove), secret);
						await contracts.Stratagems.write.makeCommitmentWithExtraReserve(
							[hash, amountToAdd, {deadline: 0n, value: amountToAdd, v: Number(v), r, s}],
							{account: account.address},
						);
					} catch (e: any) {
						this.$store.state = 'requireConfirmation';
						this.store.set(this.$store);
					}
				} else {
					const secret = '0x0000000000000000000000000000000000000000000000000000000000000000';
					const {hash, moves} = prepareCommitment(actions.map(localMoveToContractMove), secret);
					await contracts.Stratagems.write.makeCommitment([hash], {account: account.address});
				}
			} else {
				this.$store.state = 'tx';
				this.store.set(this.$store);
			}
		});

		// contracts.execute(async ({contracts, account}) => {
		//
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

import {get, writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '..';
import {contracts} from '$lib/web3';
import {actionState, localMoveToContractMove} from '$lib/action/ActionState';
import {initialContractsInfos} from '$lib/config';
import PermitComponent from './PermitComponent.svelte';
import {prepareCommitment} from 'stratagems-common';
import {hexToSignature} from 'viem';

export type CommitState = {
	permit?: {
		signature: `0x${string}`;
		amount: bigint;
		nonce: number;
	};
	amountToAdd?: bigint;
	amountToAllow?: bigint;
};

export type CommitFlow = Flow<CommitState>;

export async function startCommit() {
	await contracts.execute(async ({contracts, account, connection}) => {
		const actions = get(actionState);
		const numActions = actions.length;
		const tokenNeeded =
			BigInt(initialContractsInfos.contracts.Stratagems.linkedData.numTokensPerGems.slice(0, -1)) * BigInt(numActions);

		const tokenInReserve = await contracts.Stratagems.read.getTokensInReserve([account.address]);
		// TODO extra token to put in reserver
		const amountToAdd = tokenNeeded > tokenInReserve ? tokenNeeded - tokenInReserve : 0n;

		const tokenApproved = await contracts.TestTokens.read.allowance([account.address, contracts.Stratagems.address]);
		const amountToAllow = amountToAdd > tokenApproved ? amountToAdd - tokenApproved : 0n;

		const steps: Step<CommitState>[] = [];
		if (amountToAllow > 0n) {
			const permitStep = {
				title: 'permit',
				action: 'allow',
				description: `allow the spending of tokens`,
				component: PermitComponent,
				execute: async (state: CommitState) => {
					const amountToAllow = state.amountToAllow || 0n; // sjould not be zero
					const chainId = parseInt(initialContractsInfos.chainId);
					const nonce = Number(await contracts.TestTokens.read.nonces([account.address]));
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
							value: amountToAllow.toString(),
							nonce,
							deadline: 0,
						},
					};
					const signature = await connection.provider.request({
						method: 'eth_signTypedData_v4',
						params: [account.address, permit],
					});

					state.permit = {signature, amount: amountToAllow, nonce};
					return state;
				},
			};

			steps.push(permitStep);
		}
		const txStep = {
			title: 'transaction',
			action: 'OK',
			description: `commit your moves`,
			// component: PermitComponent,
			execute: async (state: CommitState) => {
				const secret = '0x0000000000000000000000000000000000000000000000000000000000000000';
				const {hash, moves} = prepareCommitment(actions.map(localMoveToContractMove), secret);

				if (state.permit) {
					const {v, r, s} = hexToSignature(state.permit.signature);
					await contracts.Stratagems.write.makeCommitmentWithExtraReserve(
						[hash, amountToAdd, {deadline: 0n, value: state.permit.amount, v: Number(v), r, s}],
						{account: account.address},
					);
				} else {
					await contracts.Stratagems.write.makeCommitment([hash], {account: account.address});
				}
				return state;
			},
		};
		steps.push(txStep);

		const flow: CommitFlow = {
			type: 'commit',
			currentStepIndex: writable(0),
			state: writable({amountToAdd}),
			steps,
		};
		currentFlow.start(flow);
	});
}

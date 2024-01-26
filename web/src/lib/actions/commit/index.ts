import {get, writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '../flow';
import {accountData, contracts} from '$lib/blockchain/connection';
import {initialContractsInfos} from '$lib/config';
import {prepareCommitment, zeroBytes24, zeroBytes32} from 'stratagems-common';
import {epoch, epochInfo} from '$lib/state/Epoch';
import {hexToVRS} from '$utils/eth/signatures';
import {encodeFunctionData, parseEther, zeroAddress} from 'viem';
import {time} from '$lib/blockchain/time';
import {timeToText} from '$utils/time';
import {localMoveToContractMove, type CommitMetadata} from '$lib/account/account-data';
import PermitComponent from './PermitComponent.svelte';
import {estimateGasPrice} from '$utils/eth/gas';

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
		const localMoves = accountData.$offchainState.moves;
		if (!localMoves) {
			throw new Error(`no local moves`);
		}
		const numMoves = localMoves.length;
		const tokenNeeded =
			BigInt(initialContractsInfos.contracts.Stratagems.linkedData.numTokensPerGems.slice(0, -1)) * BigInt(numMoves);

		const tokenInReserve = await contracts.Stratagems.read.getTokensInReserve([account.address]);
		// TODO extra token to put in reserver
		const amountToAdd = tokenNeeded > tokenInReserve ? tokenNeeded - tokenInReserve : 0n;

		const tokenApproved = await contracts.TestTokens.read.allowance([account.address, contracts.Stratagems.address]);
		const amountToAllow = amountToAdd > tokenApproved ? amountToAdd : 0n;

		const steps: Step<CommitState>[] = [];
		if (amountToAllow > 0n) {
			const permitStep = {
				title: 'permit',
				action: 'allow',
				description: `allow the spending of tokens`,
				component: PermitComponent,
				execute: async (state: CommitState) => {
					const amountToAllow = state.amountToAllow || 0n; // should not be zero
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
						params: [account.address, JSON.stringify(permit)],
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
				let txHash: `0x${string}`;
				// TODO random secret, actually not random, just based on secret private key + epoch
				const secret = '0x0000000000000000000000000000000000000000000000000000000000000000';
				const {hash, moves} = prepareCommitment(localMoves.map(localMoveToContractMove), secret);

				const fuzd = await accountData.getFuzd();

				// TODO if fuzd
				const gasPriceEstimates = await estimateGasPrice(connection.provider);
				// we get the fast estimate
				const estimate = gasPriceEstimates.fast;
				// we then double the maxFeePerGas to accomodate for spikes
				const maxFeePerGas = estimate.maxFeePerGas * 2n;
				const maxPriorityFeePerGas = estimate.maxPriorityFeePerGas;

				const revealGas = 50000n + 300000n * BigInt(moves.length); //TODO
				const remoteAccount = fuzd.remoteAccount;
				let value = 0n;
				if (remoteAccount !== zeroAddress) {
					const balanceHex = await connection.provider.request({
						method: 'eth_getBalance',
						params: [remoteAccount],
					});
					const balance = BigInt(balanceHex);

					const valueNeeded = maxFeePerGas * revealGas;
					// we then double that value to ensure tx go through
					const valueToProvide = valueNeeded * 2n;
					value = valueToProvide > balance ? valueToProvide - balance : 0n;
				}

				const commitMetadata: CommitMetadata = {
					type: 'commit',
					epoch: get(epoch), // TODO use from smart contract to ensure correct value
					localMoves,
					secret,
					fuzd: 'pendingTx',
				};
				connection.provider.setNextMetadata(commitMetadata);
				if (amountToAdd > 0n) {
					let permitStruct: {deadline: bigint; value: bigint; v: number; r: `0x${string}`; s: `0x${string}`} = {
						deadline: 0n,
						value: 0n,
						v: 0,
						r: zeroBytes32,
						s: zeroBytes32,
					};
					if (state.permit) {
						const {v, r, s} = hexToVRS(state.permit.signature);
						permitStruct = {
							deadline: 0n,
							value: state.permit.amount,
							v,
							r,
							s,
						};
					}
					txHash = await contracts.Stratagems.write.makeCommitmentWithExtraReserve(
						[hash, amountToAdd, permitStruct, remoteAccount],
						{
							account: account.address,
							value,
						},
					);
				} else {
					txHash = await contracts.Stratagems.write.makeCommitment([hash, remoteAccount], {
						account: account.address,
						value,
					});
				}
				accountData.resetOffchainState();

				const timeToBroadcastReveal = time.now + get(epochInfo).timeLeftToCommit;
				const data = encodeFunctionData({
					abi: contracts.Stratagems.abi,
					functionName: 'reveal',
					args: [account.address, secret, moves, zeroBytes24, true, zeroAddress],
				});
				// await contracts.Stratagems.write.reveal([account.address, data.secret, moves, zeroBytes24, true, zeroAddress]);

				const scheduleInfo = await fuzd.scheduleExecution(
					{
						slot: `epoch_${commitMetadata.epoch}`,
						broadcastSchedule: [{duration: 3600, maxFeePerGas, maxPriorityFeePerGas}],
						data,
						to: contracts.Stratagems.address,
						time: timeToBroadcastReveal,
						expiry: 3600,
						chainId: initialContractsInfos.chainId,
						gas: revealGas,
					},
					// TODO remove, for now, we basically encrypt with a current drand round, so decryption still need to operate but we can speed up the reveal time
					{fakeEncrypt: true},
				);

				console.log(`will be executed in ${timeToText(scheduleInfo.checkinTime - time.now)}`);

				accountData.recordFUZD(txHash, scheduleInfo);

				return state;
			},
		};
		steps.push(txStep);

		const flow: CommitFlow = {
			type: 'commit',
			currentStepIndex: writable(0),
			state: writable({amountToAllow, amountToAdd}),
			steps,
		};
		currentFlow.start(flow);
	});
}

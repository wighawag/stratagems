import {get, writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '../flow';
import {accountData, contracts, network} from '$lib/blockchain/connection';
import {FUZD_URI, initialContractsInfos} from '$lib/config';
import {prepareCommitment, zeroBytes24, zeroBytes32} from 'stratagems-common';
import {epoch, epochInfo} from '$lib/state/Epoch';
import {hexToVRS} from '$utils/ethereum/signatures';
import {encodeFunctionData, keccak256, zeroAddress} from 'viem';
import {time} from '$lib/blockchain/time';
import {timeToText} from '$utils/time';
import {localMoveToContractMove, type CommitMetadata} from '$lib/account/account-data';
import PermitComponent from './PermitComponent.svelte';
import {estimateGasPrice} from '$utils/ethereum/gas';
import {gameConfig} from '$lib/blockchain/networks';

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
		const localMoves = accountData.$offchainState.moves?.list;
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
				title: 'First: Allow Token Spending',
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
					const signature = (await connection.provider.request({
						method: 'eth_signTypedData_v4',
						params: [account.address, JSON.stringify(permit)],
					})) as `0x${string}`;
					state.permit = {signature, amount: amountToAllow, nonce};

					return state;
				},
			};

			steps.push(permitStep);
		}
		const txStep = {
			title: 'Perform the Commit Transaction',
			action: 'OK',
			description: `This Transaction will Commit Your Moves. You can cancel (or Replace it with new Moves) before the Resolution Phase Start.`,
			// component: PermitComponent,
			execute: async (state: CommitState) => {
				let txHash: `0x${string}`;

				// TODO gather all data in prelimenary step
				// so click to send tx becomes instant
				const epochNumber = get(epoch); // TODO use from smart contract to ensure correct value

				const localWallet = accountData.localWallet;
				if (!localWallet) {
					throw new Error(`no local wallet found`);
				}

				// TODO check for chain and contract existence
				const secretSig = await localWallet.signMessage({
					message: `Commit:${network.$state.chainId}:${network.$state.contracts?.Stratagems.address}:${epochNumber}`,
				});
				const secret = keccak256(secretSig);
				const {hash, moves} = prepareCommitment(localMoves.map(localMoveToContractMove), secret);

				let fuzdData:
					| {
							value: bigint;
							remoteAccount: `0x${string}`;
							fuzd: Awaited<ReturnType<typeof accountData.getFuzd>>;
							revealGas: bigint;
							maxFeePerGas: bigint;
							maxPriorityFeePerGas: bigint;
					  }
					| undefined;
				if (FUZD_URI) {
					const fuzd = await accountData.getFuzd();

					// TODO if fuzd
					const gasPriceEstimates = await estimateGasPrice(connection.provider);
					// we get the fast estimate
					const estimate = gasPriceEstimates.fast;
					// we then double the maxFeePerGas to accomodate for spikes
					const maxFeePerGas = estimate.maxFeePerGas * 2n;
					const maxPriorityFeePerGas = estimate.maxPriorityFeePerGas;

					const revealGas = 50000n + 300000n * BigInt(moves.length); //TODO compute worst case case
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

					fuzdData = {
						fuzd,
						maxFeePerGas,
						maxPriorityFeePerGas,
						revealGas,
						value,
						remoteAccount,
					};
				}

				const remoteAccount = fuzdData?.remoteAccount || zeroAddress;
				const value = fuzdData?.value || 0n;

				const commitMetadata: CommitMetadata = {
					type: 'commit',
					epoch: epochNumber,
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
				accountData.resetOffchainMoves();

				const timeToBroadcastReveal = time.now + get(epochInfo).timeLeftToCommit;
				const data = encodeFunctionData({
					abi: contracts.Stratagems.abi,
					functionName: 'reveal',
					args: [account.address, secret, moves, zeroBytes24, true, zeroAddress],
				});
				// await contracts.Stratagems.write.reveal([account.address, data.secret, moves, zeroBytes24, true, zeroAddress]);

				if (fuzdData) {
					const scheduleInfo = await fuzdData.fuzd.scheduleExecution(
						{
							slot: `epoch_${commitMetadata.epoch}`,
							broadcastSchedule: [
								{
									duration: gameConfig.$current.revealPhaseDuration,
									maxFeePerGas: fuzdData.maxFeePerGas,
									maxPriorityFeePerGas: fuzdData.maxPriorityFeePerGas,
								},
							],
							data,
							to: contracts.Stratagems.address,
							time: timeToBroadcastReveal,
							expiry: gameConfig.$current.revealPhaseDuration,
							chainId: initialContractsInfos.chainId,
							gas: fuzdData.revealGas,
						},
						{fakeEncrypt: time.hasTimeContract},
					);

					console.log({fakeEncrypt: time.hasTimeContract});

					console.log(`will be executed in ${timeToText(scheduleInfo.checkinTime - time.now)}`);

					accountData.recordFUZD(txHash, scheduleInfo);
				}

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

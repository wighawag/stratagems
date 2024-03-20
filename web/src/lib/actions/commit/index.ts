import {get, writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '../flow';
import {accountData, viemClient, network} from '$lib/blockchain/connection';
import {FUZD_URI, initialContractsInfos} from '$lib/config';
import {prepareCommitment, zeroBytes24, zeroBytes32} from 'stratagems-common';
import {epoch, epochInfo} from '$lib/state/Epoch';
import {hexToVRS} from '$utils/ethereum/signatures';
import {encodeFunctionData, formatEther, keccak256, parseEther, zeroAddress} from 'viem';
import {time} from '$lib/blockchain/time';
import {timeToText} from '$utils/time';
import {localMoveToContractMove, type CommitMetadata} from '$lib/account/account-data';
import PermitComponent from './PermitComponent.svelte';
import TransactionComponent from './TransactionComponent.svelte';
import {gameConfig} from '$lib/blockchain/networks';

export type CommitState = {
	permit?: {
		signature: `0x${string}`;
		amount: bigint;
		nonce: number;
	};
	permitCurrentNonce?: number;
	amountToAdd?: bigint;
	amountToAllow?: bigint;
	fuzdData?: {
		slot: string;
		value: bigint;
		remoteAccount: `0x${string}`;
		fuzd: Awaited<ReturnType<typeof accountData.getFUZD>>;
		revealGas: bigint;
		maxFeePerGas: bigint;
		maxPriorityFeePerGas: bigint;
	};
	gasPrice?: {
		maxFeePerGas: bigint;
		maxPriorityFeePerGas: bigint;
	};
	epochNumber?: number;
	txHash?: `0x${string}`;
	revealTxData?: `0x${string}`;
	secret?: `0x${string}`;
	timeToBroadcastReveal?: number;
};

export type CommitFlow = Flow<CommitState>;

export async function startCommit() {
	await viemClient.execute(async ({client, account, connection, network: {contracts}}) => {
		const {Stratagems, TestTokens} = contracts;
		const localMoves = accountData.$offchainState.moves?.list;
		if (!localMoves) {
			throw new Error(`no local moves`);
		}
		const numMoves = localMoves.length;
		const tokenNeeded =
			BigInt(initialContractsInfos.contracts.Stratagems.linkedData.numTokensPerGems.slice(0, -1)) * BigInt(numMoves);

		const steps: Step<CommitState>[] = [];

		const gatheringInfoStep = {
			title: 'Gathering Info',
			description: `Gather the Necessary Information to Perform the Commit`,
			execute: async (state: CommitState) => {
				// so click to send tx becomes instant
				const epochNumber = get(epoch); // TODO use from smart contract to ensure correct value

				const tokenInReserve = await client.public.readContract({
					...Stratagems,
					functionName: 'getTokensInReserve',
					args: [account.address],
				});
				// TODO extra token to put in reserver
				const amountToAdd = tokenNeeded > tokenInReserve ? tokenNeeded - tokenInReserve : 0n;

				const tokenApproved = await client.public.readContract({
					...TestTokens,
					functionName: 'allowance',
					args: [account.address, Stratagems.address],
				});
				const amountToAllow = amountToAdd > tokenApproved ? amountToAdd : 0n;

				state.amountToAdd = amountToAdd;

				if (amountToAllow) {
					const nonce = Number(
						await client.public.readContract({
							...TestTokens,
							functionName: 'nonces',
							args: [account.address],
						}),
					);
					state.permitCurrentNonce = nonce;
					state.amountToAllow = amountToAllow;
				}

				// ----------------------------------------------------------------------------------------
				// Gather the various fees and gas prices
				// ----------------------------------------------------------------------------------------
				let {maxFeePerGas, maxPriorityFeePerGas, gasPrice} = await client.public.estimateFeesPerGas({
					type: 'eip1559',
				});
				let extraFee = 0n;
				if (!maxFeePerGas) {
					if (gasPrice) {
						maxFeePerGas = gasPrice;
						maxPriorityFeePerGas = gasPrice;
					} else {
						const errorMessage = `could not fetch gasPrice`;
						throw new Error(errorMessage);
					}
				} else {
					if (!maxPriorityFeePerGas) {
						maxPriorityFeePerGas = 1000000n;
					}
				}

				// ----------------------------------------------------------------------------------------

				if (accountData.hasFUZD()) {
					const fuzd = await accountData.getFUZD();
					const revealGas = 100000n + 200000n * BigInt(localMoves.length); //TODO compute worst case case
					if ('estimateContractL1Fee' in client.public) {
						// post fake data but same length to get an idea of the l1 fee
						const l1Fee = await client.public.estimateContractL1Fee({
							...Stratagems,
							functionName: 'reveal',
							args: [
								account.address,
								'0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
								localMoves.map((v, i) => ({
									position: BigInt(Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1)) + 1),
									color: Math.floor(Math.random() * 5) + 1,
								})),
								zeroBytes24,
								true,
								zeroAddress,
							],
							account: account.address,
							gas: revealGas,
							maxFeePerGas,
							maxPriorityFeePerGas,
						});
						// TODO:
						// const l1BaseFee = await client.public.getL1BaseFee();
						// const gasPlusFactorsForL1 = (l1Fee / l1BaseFee) + 1;
						// const updatedL1Fee = gasPlusFactorsForL1 * highBaseFee;

						extraFee = l1Fee * 2n; // we multiply by 2 just in case
					}

					const remoteAccount = fuzd.remoteAccount;
					let value = 0n;
					if (remoteAccount !== zeroAddress) {
						const balanceHex = await connection.provider.request({
							method: 'eth_getBalance',
							params: [remoteAccount, 'latest'],
						});
						const balance = BigInt(balanceHex);

						const valueNeeded = maxFeePerGas * revealGas + extraFee;
						// we then double that value to ensure tx go through
						const valueToProvide = valueNeeded * 2n;
						value = valueToProvide > balance ? valueToProvide - balance : 0n;
					}

					console.log({
						value: formatEther(value),
						rawValue: value,
						maxFeePerGas: formatEther(maxFeePerGas),
						maxPriorityFeePerGas: formatEther(maxPriorityFeePerGas),
					});

					state.fuzdData = {
						slot: `epoch_${epochNumber}`,
						fuzd,
						maxFeePerGas,
						maxPriorityFeePerGas,
						revealGas,
						value,
						remoteAccount,
					};
				}

				state.epochNumber = epochNumber;
				state.gasPrice = {
					maxFeePerGas,
					maxPriorityFeePerGas,
				};

				return {
					newState: state,
					nextStep: amountToAllow ? 1 : 2,
				};
			},
		};
		steps.push(gatheringInfoStep);

		const permitStep = {
			title: 'First: Allow Token Spending',
			action: 'allow',
			description: `allow the spending of tokens`,
			component: PermitComponent,
			execute: async (state: CommitState) => {
				const amountToAllow = state.amountToAllow || 0n; // should not be zero
				const chainId = parseInt(initialContractsInfos.chainId);

				const nonce = state.permitCurrentNonce;
				if (!nonce) {
					throw new Error(`no permitCurrentNonce set`);
				}
				const permit = {
					domain: {
						name: 'Tokens',
						chainId,
						verifyingContract: TestTokens.address,
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
						spender: Stratagems.address,
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

				return {newState: state};
			},
		};

		steps.push(permitStep);

		const txStep = {
			title: 'Perform the Commit Transaction',
			action: 'OK',
			description: `This Transaction will Commit Your Moves. You can cancel (or Replace it with new Moves) before the Resolution Phase Start.`,
			component: TransactionComponent,
			execute: async (state: CommitState) => {
				const {amountToAdd, permit, fuzdData, gasPrice, epochNumber} = state;

				if (!gasPrice) {
					throw new Error(`did not fetch gasPrice`);
				}

				if (!epochNumber) {
					throw new Error(`did not record epochNumber`);
				}

				let txHash: `0x${string}`;

				const localWallet = accountData.localWallet;
				if (!localWallet) {
					throw new Error(`no local wallet found`);
				}

				// TODO check for chain and contract existence
				const secretSig = await localWallet.signMessage({
					message: `Commit:${network.$state.chainId}:${network.$state.contracts?.Stratagems.address}:${epochNumber}`,
				});
				const secret = keccak256(secretSig);
				state.secret = secret;
				const {hash, moves} = prepareCommitment(localMoves.map(localMoveToContractMove), secret);

				const remoteAccount = fuzdData?.remoteAccount || zeroAddress;
				const value = fuzdData?.value || 0n;

				const commitMetadata: CommitMetadata = {
					type: 'commit',
					epoch: epochNumber,
					localMoves,
					secret,
					autoReveal: fuzdData
						? {
								type: 'fuzd',
								slot: fuzdData.slot,
							}
						: false,
				};
				connection.provider.setNextMetadata(commitMetadata);
				if (amountToAdd && amountToAdd > 0n) {
					let permitStruct: {deadline: bigint; value: bigint; v: number; r: `0x${string}`; s: `0x${string}`} = {
						deadline: 0n,
						value: 0n,
						v: 0,
						r: zeroBytes32,
						s: zeroBytes32,
					};
					if (permit) {
						const {v, r, s} = hexToVRS(permit.signature);
						permitStruct = {
							deadline: 0n,
							value: permit.amount,
							v,
							r,
							s,
						};
					}
					txHash = await client.wallet.writeContract({
						...Stratagems,
						functionName: 'makeCommitmentWithExtraReserve',
						args: [hash, amountToAdd, permitStruct, remoteAccount],
						account: account.address,
						value,
						maxFeePerGas: gasPrice.maxFeePerGas,
						maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
					});
				} else {
					txHash = await client.wallet.writeContract({
						...Stratagems,
						functionName: 'makeCommitment',
						args: [hash, remoteAccount],
						account: account.address,
						value,
						maxFeePerGas: gasPrice.maxFeePerGas,
						maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas,
					});
				}
				state.txHash = txHash;

				accountData.resetOffchainMoves(epochNumber);

				const timeToBroadcastReveal = time.now + get(epochInfo).timeLeftToCommit;
				const data = encodeFunctionData({
					abi: contracts.Stratagems.abi,
					functionName: 'reveal',
					args: [account.address, secret, moves, zeroBytes24, true, zeroAddress],
				});
				state.timeToBroadcastReveal = timeToBroadcastReveal;
				state.revealTxData = data;
				// await contracts.Stratagems.write.reveal([account.address, data.secret, moves, zeroBytes24, true, zeroAddress]);

				let fuzdFailed = false;
				if (fuzdData) {
					try {
						const scheduleInfo = await fuzdData.fuzd.scheduleExecution(
							{
								slot: fuzdData.slot,
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
					} catch {
						fuzdFailed = true;
					}
				}

				return {newState: state, nextStep: fuzdFailed ? 3 : 4};
			},
		};
		steps.push(txStep);

		const retryFUZDStep = {
			title: 'Fuzd Fails',
			action: 'OK',
			description: `We could not schedule the execution for later reveal. Please try again. If this error persist, you ll need to revea your move manually during the reveal phase`,
			// component: PermitComponent,
			execute: async (state: CommitState) => {
				const {fuzdData, epochNumber, revealTxData, txHash, secret, timeToBroadcastReveal} = state;
				if (!txHash) {
					throw new Error(`did not record txHash`);
				}
				if (!timeToBroadcastReveal) {
					throw new Error(`did not record timeToBroadcastReveal`);
				}
				if (!revealTxData) {
					throw new Error(`did not record revealTxData`);
				}
				if (!secret) {
					throw new Error(`did not record secret`);
				}
				if (!epochNumber) {
					throw new Error(`did not record epochNumber`);
				}
				const localWallet = accountData.localWallet;
				if (!localWallet) {
					throw new Error(`no local wallet found`);
				}

				let fuzdFailed = false;
				if (fuzdData) {
					try {
						const scheduleInfo = await fuzdData.fuzd.scheduleExecution(
							{
								slot: fuzdData.slot,
								broadcastSchedule: [
									{
										duration: gameConfig.$current.revealPhaseDuration,
										maxFeePerGas: fuzdData.maxFeePerGas,
										maxPriorityFeePerGas: fuzdData.maxPriorityFeePerGas,
									},
								],
								data: revealTxData,
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
					} catch {
						fuzdFailed = true;
					}
				}
				return {newState: state, nextStep: fuzdFailed ? 3 : 4};
			},
		};

		steps.push(retryFUZDStep);

		const flow: CommitFlow = {
			type: 'commit',
			currentStepIndex: writable(0),
			state: writable({amountToAllow: undefined, amountToAdd: undefined}),
			completionMessage: 'Commitment Complete.',
			steps,
		};
		currentFlow.start(flow);
	});
}

import {get, writable} from 'svelte/store';
import {currentFlow, type Flow, type Step} from '../flow';
import {accountData, viemClient, network} from '$lib/blockchain/connection';
import {FUZD_URI, initialContractsInfos} from '$lib/config';
import {prepareCommitment, zeroBytes24, zeroBytes32, type ContractMove, Color} from 'stratagems-common';
import {epoch, epochInfo} from '$lib/state/Epoch';
import {hexToVRS} from '$utils/ethereum/signatures';
import {encodeFunctionData, formatEther, keccak256, parseEther, zeroAddress} from 'viem';
import {time} from '$lib/blockchain/time';
import {timeToText} from '$utils/time';
import {localMoveToContractMove, type CommitMetadata} from '$lib/account/account-data';
import PermitComponent from './PermitComponent.svelte';
import TransactionComponent from './TransactionComponent.svelte';
import {gameConfig} from '$lib/blockchain/networks';
import NotEnoughEthComponent from './NotEnoughEthComponent.svelte';
import {getRoughGasPriceEstimate} from '$utils/ethereum/gas';

export type CommitState = {
	tokenData?: {
		amountToAdd: bigint;
		amountToAllow: bigint;
		permitCurrentNonce?: number;
	};

	permit?: {
		signature: `0x${string}`;
		amount: bigint;
		nonce: number;
	};

	fuzdData?: {
		submission: {
			chainId: string;
			slot: string;
			maxFeePerGasAuthorized: bigint;
			transaction: {
				data: `0x${string}`;
				to: `0x${string}`;
				gas: bigint;
			}
			time: number;
			expiry: number;
			paymentReserve?: bigint;
		};
		remoteAccount: `0x${string}`;
		fuzd: Awaited<ReturnType<typeof accountData.getFUZD>>;
	};

	balanceData?: {
		nativeToken: bigint;
		amountRequired: bigint;
	};

	transaction?: {
		to: `0x${string}`;
		data: `0x${string}`;
		maxFeePerGas: bigint;
		maxPriorityFeePerGas: bigint;
		value: bigint;
	};

	commitmentData?: {
		metadata: CommitMetadata;
		epochNumber: number;
		secret: `0x${string}`;
		moves: ContractMove[];
	};

	txHash?: `0x${string}`;
};

export type CommitFlow = Flow<CommitState>;

export async function startCommit() {
	await viemClient.execute(async ({client, account, connection, network: {contracts}}) => {
		const {Stratagems, TestTokens} = contracts;
		const localMoves = accountData.$offchainState.moves?.list;
		if (!localMoves) {
			throw new Error(`no local moves`);
		}
		const numMovesRequiringToken = localMoves.filter((v) => v.color != Color.None).length;
		const tokenNeeded =
			BigInt(initialContractsInfos.contracts.Stratagems.linkedData.numTokensPerGems.slice(0, -1)) *
			BigInt(numMovesRequiringToken);

		const steps: Step<CommitState>[] = [];

		const checkingAllowanceStep = {
			title: 'Checking Allowance',
			description: `Checking Stratagems token allowance`,
			execute: async (state: CommitState) => {
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

				state.tokenData = {amountToAdd, amountToAllow};

				if (amountToAllow) {
					const nonce = Number(
						await client.public.readContract({
							...TestTokens,
							functionName: 'nonces',
							args: [account.address],
						}),
					);
					state.tokenData.permitCurrentNonce = nonce;
				}

				return {
					newState: state,
					nextStep: amountToAllow ? 1 : 2,
					auto: amountToAllow ? false : true,
				};
			},
		};

		steps.push(checkingAllowanceStep);

		const permitStep = {
			title: 'First: Allow Token Spending',
			action: 'allow',
			description: `allow the spending of tokens`,
			component: PermitComponent,
			execute: async (state: CommitState) => {
				const {tokenData} = state;

				if (!tokenData) {
					throw new Error(`did not record tokenData`);
				}
				const amountToAllow = tokenData.amountToAllow;
				const chainId = parseInt(initialContractsInfos.chainId);

				const nonce = tokenData.permitCurrentNonce;
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

		const gatheringInfoStep = {
			title: 'Gathering Info',
			description: `Gather the Necessary Information to Perform the Commit`,
			execute: async (state: CommitState) => {
				const localWallet = accountData.localWallet;
				if (!localWallet) {
					throw new Error(`no local wallet found`);
				}

				// so click to send tx becomes instant
				const epochNumber = get(epoch); // TODO use from smart contract to ensure correct value

				console.log(`getting balance...`);
				const balanceETH = await client.public.getBalance({
					address: account.address,
				});

				// ----------------------------------------------------------------------------------------
				// Gather the various fees and gas prices
				// ----------------------------------------------------------------------------------------
				console.log(`estimating gas prices...`);
				// let {maxFeePerGas, maxPriorityFeePerGas, gasPrice} = await client.public.estimateFeesPerGas({
				// 	type: 'eip1559',
				// });
				const estimates = await getRoughGasPriceEstimate(connection.provider);
				let {maxFeePerGas, maxPriorityFeePerGas} = estimates.average;
				const gasPrice = estimates.gasPrice;

				if (maxFeePerGas === undefined || !maxPriorityFeePerGas === undefined) {
					throw new Error(`could not get gas price`);
				}

				// ----------------------------------------------------------------------------------------

				// TODO check for chain and contract existence
				console.log(`generating deterministic secret...`);
				const secretSig = await localWallet.signMessage({
					message: `Commit:${network.$state.chainId}:${network.$state.contracts?.Stratagems.address}:${epochNumber}`,
				});
				const secret = keccak256(secretSig);

				const {hash, moves} = prepareCommitment(localMoves.map(localMoveToContractMove), secret);

				let value = 0n;
				if (accountData.hasFUZD()) {
					console.log(`FUZD enabled, adjusting gas prices for the future...`);
					let maxFeePerGasForReveal = maxFeePerGas || 0n;
					let maxPriorityFeePerGasForReveal = maxPriorityFeePerGas || 0n;
					// TODO per network, this was taken from Base on 21/03/2024 at 23:30 UTC
					const minWorstCaseFeePerGas = BigInt(500000000);
					const minWorstCaseFPriorityFeePerGas = BigInt(200000000);
					if (maxFeePerGasForReveal < minWorstCaseFeePerGas) {
						maxFeePerGasForReveal = minWorstCaseFeePerGas;
					}
					if (maxPriorityFeePerGasForReveal < minWorstCaseFPriorityFeePerGas) {
						maxPriorityFeePerGasForReveal = minWorstCaseFPriorityFeePerGas;
					}
					let extraFeeForReveal = 0n;
					if (!maxFeePerGasForReveal) {
						if (gasPrice) {
							maxFeePerGasForReveal = gasPrice;
							maxPriorityFeePerGasForReveal = gasPrice;
						} else {
							const errorMessage = `could not fetch gasPrice`;
							throw new Error(errorMessage);
						}
					} else {
						if (!maxPriorityFeePerGasForReveal) {
							maxPriorityFeePerGasForReveal = 1000000n;
						}
					}
					const fuzd = await accountData.getFUZD();
					const revealGas = 100000n + 200000n * BigInt(localMoves.length); //TODO compute worst case case
					if ('estimateContractL1Fee' in client.public) {
						console.log(`including l1 cost ...`);
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

						extraFeeForReveal = l1Fee * 2n; // we multiply by 2 just in case
					}

					const remoteAccount = fuzd.remoteAccount;

					if (remoteAccount !== zeroAddress) {
						console.log(`fetching remote account balance....`);
						const balanceHex = await connection.provider.request({
							method: 'eth_getBalance',
							params: [remoteAccount, 'latest'],
						});
						const balance = BigInt(balanceHex);

						const valueNeeded = maxFeePerGasForReveal * revealGas + extraFeeForReveal;
						// we then double that value to ensure tx go through
						const valueToProvide = valueNeeded * 2n;
						value = valueToProvide > balance ? valueToProvide - balance : 0n;

						const timeToBroadcastReveal = time.now + get(epochInfo).timeLeftToCommit;
						const data = encodeFunctionData({
							abi: contracts.Stratagems.abi,
							functionName: 'reveal',
							args: [account.address, secret, moves, zeroBytes24, true, zeroAddress],
						});
						state.fuzdData = {
							submission: {
								chainId: initialContractsInfos.chainId,
								slot: `epoch_${epochNumber}`,
								maxFeePerGasAuthorized: maxFeePerGasForReveal,
								transaction: {
									data,
									to: contracts.Stratagems.address,
									gas: revealGas,
								},
								time: timeToBroadcastReveal,
								expiry: gameConfig.$current.revealPhaseDuration,
								paymentReserve: valueToProvide,
							},
							remoteAccount,
							fuzd,
						};
					}
				}

				state.commitmentData = {
					secret,
					epochNumber,
					moves,
					metadata: {
						type: 'commit',
						epoch: epochNumber,
						localMoves,
						secret,
						autoReveal: state.fuzdData
							? {
									type: 'fuzd',
									slot: state.fuzdData.submission.slot,
								}
							: false,
					},
				};

				let transactionData: {data: `0x${string}`; gasEstimate: bigint; extraFee: bigint};

				const remoteAccount = state.fuzdData?.remoteAccount || zeroAddress;

				if (state.tokenData?.amountToAdd && state.tokenData?.amountToAdd > 0n) {
					console.log(`preparing tx data including permit...`);
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

					const params = {
						...Stratagems,
						functionName: 'makeCommitmentWithExtraReserve',
						args: [hash, state.tokenData.amountToAdd, permitStruct, remoteAccount],
						account: account.address,
					} as const;

					const gasEstimate = await client.public.estimateContractGas({
						...params,
						value: 1n, // fake to wirk even if not enough ETH
					});
					const data = encodeFunctionData({
						...params,
					});
					let extraFee: bigint = 0n;
					if ('estimateContractL1Fee' in client.public) {
						const l1Fee = await client.public.estimateContractL1Fee({
							...params,
							value: 1n, // fake to wirk even if not enough ETH
						});
						extraFee = l1Fee;
					}

					transactionData = {
						data,
						gasEstimate,
						extraFee,
					};
				} else {
					console.log(`preparing tx data without permit...`);
					const params = {
						...Stratagems,
						functionName: 'makeCommitment',
						args: [hash, remoteAccount],
						account: account.address,
					} as const;

					const gasEstimate = await client.public.estimateContractGas({
						...params,
						value: 1n, // fake to wirk even if not enough ETH
					});
					const data = encodeFunctionData({
						...params,
					});
					let extraFee: bigint = 0n;
					if ('estimateContractL1Fee' in client.public) {
						const l1Fee = await client.public.estimateContractL1Fee({
							...params,
							value: 1n, // fake to wirk even if not enough ETH
						});
						extraFee = l1Fee;
					}

					transactionData = {
						data,
						gasEstimate,
						extraFee,
					};
				}
				state.transaction = {
					data: transactionData.data,
					to: Stratagems.address,
					value,
					maxFeePerGas,
					maxPriorityFeePerGas,
				};

				state.balanceData = {
					nativeToken: balanceETH,
					amountRequired: (transactionData.gasEstimate + 20000n) * maxFeePerGas + transactionData.extraFee + value,
				}; // TODO

				const enoughETH = state.balanceData.nativeToken >= state.balanceData.amountRequired;
				if (!enoughETH) {
					console.error(`not enough eth`);
				}

				return {
					newState: state,
					nextStep: enoughETH ? 4 : 3,
				};
			},
		};
		steps.push(gatheringInfoStep);

		const notEnoughETHStep = {
			title: 'You dont have enough ETH',
			action: 'OK',
			description: `You need more ETH to proceed`,
			component: NotEnoughEthComponent,
			end: true,
			execute: async (state: CommitState) => {
				return {newState: state, nextStep: 6};
			},
		};
		steps.push(notEnoughETHStep);

		const txStep = {
			title: 'Perform the Commit Transaction',
			action: 'OK',
			description: `This Transaction will Commit Your Moves. You can cancel (or Replace it with new Moves) before the Resolution Phase Start.`,
			component: TransactionComponent,
			execute: async (state: CommitState) => {
				const {fuzdData, transaction, commitmentData} = state;

				if (!commitmentData) {
					throw new Error(`did not record commitmentData`);
				}

				if (!transaction) {
					throw new Error(`did not record transaction`);
				}

				connection.provider.setNextMetadata(commitmentData.metadata);
				const txHash = await client.wallet.sendTransaction(transaction);

				state.txHash = txHash;

				accountData.resetOffchainMoves(commitmentData.epochNumber);

				let fuzdFailed = false;
				if (fuzdData) {
					try {
						const scheduleInfo = await fuzdData.fuzd.scheduleExecution(fuzdData.submission, {
							fakeEncrypt: time.hasTimeContract,
						});

						console.log({fakeEncrypt: time.hasTimeContract});

						console.log(`will be executed in ${timeToText(scheduleInfo.checkinTime - time.now)}`);

						accountData.recordFUZD(txHash, scheduleInfo);
					} catch {
						fuzdFailed = true;
					}
				}

				return {newState: state, nextStep: fuzdFailed ? 5 : 6};
			},
		};
		steps.push(txStep);

		const retryFUZDStep = {
			title: 'Fuzd Fails',
			action: 'OK',
			description: `We could not schedule the execution for later reveal. Please try again. If this error persist, you ll need to revea your move manually during the reveal phase`,
			// component: PermitComponent,
			execute: async (state: CommitState) => {
				const {fuzdData, txHash} = state;
				if (!txHash) {
					throw new Error(`did not record txHash`);
				}
				if (!fuzdData) {
					throw new Error(`did not record fuzdData`);
				}
				const localWallet = accountData.localWallet;
				if (!localWallet) {
					throw new Error(`no local wallet found`);
				}

				let fuzdFailed = false;
				if (fuzdData) {
					try {
						const scheduleInfo = await fuzdData.fuzd.scheduleExecution(fuzdData.submission, {
							fakeEncrypt: time.hasTimeContract,
						});

						console.log({fakeEncrypt: time.hasTimeContract});

						console.log(`will be executed in ${timeToText(scheduleInfo.checkinTime - time.now)}`);

						accountData.recordFUZD(txHash, scheduleInfo);
					} catch {
						fuzdFailed = true;
					}
				}
				return {newState: state, nextStep: fuzdFailed ? 5 : 6};
			},
		};

		steps.push(retryFUZDStep);

		const flow: CommitFlow = {
			type: 'commit',
			currentStepIndex: writable(0),
			state: writable({}),
			completionMessage: 'Commitment Complete.',
			steps,
		};
		currentFlow.start(flow);
	});
}

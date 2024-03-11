import {timelockEncrypt, roundTime, roundAt, timelockDecrypt, Buffer, HttpChainClient} from 'tlock-js';
(globalThis as any).Buffer = Buffer;

import type {
	ScheduleInfo,
	ScheduledExecution,
	TimeBasedTiming,
	RoundBasedTiming,
	DecryptedPayload,
} from 'fuzd-scheduler';
import type {BroadcastSchedule, TransactionSubmission} from 'fuzd-executor';
import {privateKeyToAccount} from 'viem/accounts';
import {deriveRemoteAddress} from 'remote-account';

export {testnetClient, mainnetClient} from 'tlock-js';

export type ClientConfig = {
	drand: HttpChainClient;
	schedulerEndPoint: string | ((id: string, execution: string, signature: `0x${string}`) => Promise<ScheduleInfo>);
	privateKey: `0x${string}`;
};

export function createClient(config: ClientConfig) {
	if (typeof config.schedulerEndPoint !== 'string') {
		throw new Error(`only support uri for schedulerEndPoint`);
	}
	const schedulerEndPoint = config.schedulerEndPoint.endsWith('/')
		? config.schedulerEndPoint.slice(0, -1)
		: config.schedulerEndPoint;
	const wallet = privateKeyToAccount(config.privateKey);

	async function getRemoteAccount() {
		const publicKey = await fetch(`${schedulerEndPoint}/publicKey`).then((v) => v.text());
		const remoteAddress = deriveRemoteAddress(publicKey, wallet.address);
		return remoteAddress;
	}
	async function scheduleExecution(
		execution: {
			slot: string;
			chainId: `0x${string}` | string;
			gas: bigint;
			broadcastSchedule: [
				{
					duration: number;
					maxFeePerGas: bigint;
					maxPriorityFeePerGas: bigint;
				},
			];
			data: `0x${string}`;
			to: `0x${string}`;
			time: number;
			expiry?: number;
		},
		options?: {fakeEncrypt?: boolean},
	): Promise<ScheduleInfo> {
		let executionToSend: ScheduledExecution<
			TransactionSubmission,
			RoundBasedTiming | TimeBasedTiming,
			RoundBasedTiming | TimeBasedTiming
		>;

		const chainId = (
			execution.chainId.startsWith('0x') ? execution.chainId : `0x` + parseInt(execution.chainId).toString(16)
		) as `0x${string}`;

		const payloadJSON: DecryptedPayload<TransactionSubmission> = {
			type: 'clear',
			transactions: [
				{
					type: '0x2',
					chainId,
					gas: ('0x' + execution.gas.toString(16)) as `0x${string}`,
					broadcastSchedule: execution.broadcastSchedule.map((v) => ({
						duration: ('0x' + v.duration.toString(16)) as `0x${string}`,
						maxFeePerGas: ('0x' + v.maxFeePerGas.toString(16)) as `0x${string}`,
						maxPriorityFeePerGas: ('0x' + v.maxPriorityFeePerGas.toString(16)) as `0x${string}`,
					})) as BroadcastSchedule,
					data: execution.data,
					to: execution.to,
				},
			],
		};
		const payloadAsJSONString = JSON.stringify(payloadJSON);

		let round: number;
		const drandChainInfo = await config.drand.chain().info();
		round = roundAt(options?.fakeEncrypt ? Date.now() : execution.time * 1000, drandChainInfo);

		const payload = await timelockEncrypt(round, Buffer.from(payloadAsJSONString, 'utf-8'), config.drand);
		executionToSend = {
			slot: execution.slot,
			chainId,
			timing: {
				type: 'fixed',
				value: {
					type: 'round',
					expectedTime: execution.time,
					round,
				},
				expiry: execution.expiry,
			},
			type: 'time-locked',
			payload,
		} as any;
		const jsonAsString = JSON.stringify(executionToSend);
		const signature = await wallet.signMessage({message: jsonAsString});
		if (typeof config.schedulerEndPoint === 'string') {
			const response = await fetch(`${schedulerEndPoint}/scheduleExecution`, {
				method: 'POST',
				body: jsonAsString,
				headers: {
					signature,
					'content-type': 'application/json',
				},
			});
			if (response.status === 200) {
				return response.json();
			} else {
				const text = await response.text();
				console.error(`failed to schedule execution via FUZD`, text);
				throw new Error(`failed to schedule execution via FUZD`);
			}
		} else {
			return config.schedulerEndPoint(signature, jsonAsString, signature);
		}
	}

	return {
		scheduleExecution,
		getRemoteAccount,
	};
}

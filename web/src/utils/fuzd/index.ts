import {timelockEncrypt, roundTime, roundAt, timelockDecrypt, Buffer, HttpChainClient} from 'tlock-js';
(globalThis as any).Buffer = Buffer;

import type {ScheduleInfo, ScheduledExecution, DecryptedPayload} from 'fuzd-scheduler';
import type {ExecutionSubmission} from 'fuzd-executor';
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
		const publicKey = await fetch(`${schedulerEndPoint}/api/publicKey`).then((v) => v.text());
		const remoteAddress = deriveRemoteAddress(publicKey, wallet.address);
		return remoteAddress;
	}
	async function scheduleExecution(
		execution: {
			slot: string;
			chainId: `0x${string}` | string;
			transaction: {
				gas: bigint;
				data: `0x${string}`;
				to: `0x${string}`;
			}
			maxFeePerGasAuthorized: bigint;
			time: number;
			expiry?: number;
			paymentReserve?: bigint;
		},
		options?: {fakeEncrypt?: boolean},
	): Promise<ScheduleInfo> {
		let executionToSend: ScheduledExecution<ExecutionSubmission>;

		const chainId = (
			execution.chainId.startsWith('0x') ? execution.chainId : `0x` + parseInt(execution.chainId).toString(16)
		) as `0x${string}`;

		const payloadJSON: DecryptedPayload<ExecutionSubmission> = {
			type: 'clear',
			executions: [
				{
					chainId,
					transaction: {
						type: '0x2',
						gas: ('0x' + execution.transaction.gas.toString(16)) as `0x${string}`,
						data: execution.transaction.data,
						to: execution.transaction.to,
					},
					maxFeePerGasAuthorized: ('0x' + execution.maxFeePerGasAuthorized.toString(16)) as `0x${string}`,
				},
			],
		};
		const payloadAsJSONString = JSON.stringify(payloadJSON);

		let round: number;
		const drandChainInfo = await config.drand.chain().info();
		round = roundAt(options?.fakeEncrypt ? Date.now() : execution.time * 1000, drandChainInfo);

		const payload = await timelockEncrypt(round, Buffer.from(payloadAsJSONString, 'utf-8'), config.drand);
		executionToSend = {
			type: 'time-locked',
			slot: execution.slot,
			chainId,
			timing: {
				type: 'fixed-round',
				expectedTime: execution.time,
				scheduledRound: round,
				expiry: execution.expiry,
			},
			paymentReserve: execution.paymentReserve ? `0x${execution.paymentReserve.toString(16)}` : undefined,
			payload,
		};
		const jsonAsString = JSON.stringify(executionToSend);
		const signature = await wallet.signMessage({message: jsonAsString});
		if (typeof config.schedulerEndPoint === 'string') {
			const response = await fetch(`${schedulerEndPoint}/api/scheduling/scheduleExecution`, {
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

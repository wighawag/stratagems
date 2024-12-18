<script lang="ts">
	import {accountData, network, viemClient} from '$lib/blockchain/connection';
	import {gameConfig, initialContractsInfos} from '$lib/blockchain/networks';
	import {time} from '$lib/blockchain/time';
	import {getRoughGasPriceEstimate} from '$utils/ethereum/gas';
	import type {ScheduleInfo} from 'fuzd-scheduler';
	import {formatEther} from 'viem';

	async function fetchData() {
		return viemClient.execute(async ({client, account, connection, network: {contracts}}) => {
			const estimates = await getRoughGasPriceEstimate(connection.provider);
			let {maxFeePerGas, maxPriorityFeePerGas} = estimates.fast;
			if (maxFeePerGas === undefined || !maxPriorityFeePerGas === undefined) {
				throw new Error(`could not get gas price`);
			}

			let extraFeeForReveal = 0n;

			if (!network.$state.chainId){
				throw new Error(`not connected to any chain`);
			}
			const fuzd = await accountData.getFUZD(network.$state.chainId);
			const gas = 30000n;

			if ('estimateContractL1Fee' in client.public) {
				const l1Fee = await client.public.estimateL1Fee({
					to: account.address,
					account: account.address,
					gas,
					maxFeePerGas,
					maxPriorityFeePerGas,
				});
				extraFeeForReveal = l1Fee;
			}

			const remoteAccount = fuzd.remoteAccount;
			console.log(`fetching remote account balance....`);
			const balanceHex = await connection.provider.request({
				method: 'eth_getBalance',
				params: [remoteAccount.address, 'latest'],
			});
			const balance = BigInt(balanceHex);
			const valueNeeded = maxFeePerGas * gas + extraFeeForReveal;
			const value = balance - valueNeeded;
			return {fuzd, account, balance, valueNeeded, value, gas, maxFeePerGas, maxPriorityFeePerGas};
		});
	}

	async function load() {
		const data = await fetchData();
		if (data) {
			return data;
		} else {
			throw new Error(`could not fetch data`);
		}
	}

	let result: Promise<{balance: bigint; value: bigint}> | undefined;

	let schedulingResponse: Promise<ScheduleInfo> | undefined;

	async function withdraw() {
		if (accountData.hasFUZD()) {
			const data = await fetchData();
			if (data) {
				const {fuzd, maxFeePerGas, maxPriorityFeePerGas, account, value, gas} = data;
				const scheduleInfo = await fuzd.fuzdClient.scheduleExecution(
					{
						chainId: initialContractsInfos.chainId,
						slot: `withdrawal`,
						maxFeePerGasAuthorized: maxFeePerGas,
						transaction: {
							data: '0x',
							to: account.address,
							value,
							gas,
						},
						time: time.now + 10,
						expiry: gameConfig.$current.revealPhaseDuration,
					},
					{
						fakeEncrypt: time.hasTimeContract,
					},
				);
				return scheduleInfo;
			} else {
				throw new Error(`could not fetch data`);
			}
		}
		throw new Error(`no fuzd setup`);
	}
</script>

{#if result}
	{#await result}
		loading...
	{:then data}
		{#if schedulingResponse}
			{#await schedulingResponse}
				subbmitting...
			{:then scheduleInfo}
				wait a couple of minutes
				<button on:click={() => location.reload()}>reload</button>
			{:catch err}
				{err}
			{/await}
		{:else if data.value >= 0}
			<button
				on:click={() => {
					schedulingResponse = withdraw().then(v => {
						if (v.success) {
							return v.info;
						} else {
							throw v.error;
						}
					});
				}}>withdraw {formatEther(data.value)} ETH</button
			>
		{:else}
			No balance to witdraw
		{/if}
	{:catch err}
		<p>err</p>
	{/await}
{:else}
	<button
		on:click={() => {
			result = load();
		}}>load</button
	>
{/if}

<style>
	button {
		margin: 1rem;
	}
</style>

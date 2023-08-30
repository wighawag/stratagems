<script lang="ts">
	import Executor from '$lib/components/utilities/Executor.svelte';
	import {time} from '$lib/time';
	import {increaseBlockTime, increaseContractTime} from '$lib/utils/debug';

	let error: any;
	let state: 'addTime' | undefined;

	async function addTime(numHours: number) {
		try {
			state = 'addTime';
			await increaseBlockTime(numHours * 3600);
		} catch (err) {
		} finally {
			state = undefined;
		}
	}

	async function addContractTime(numHours: number) {
		try {
			state = 'addTime';
			await increaseContractTime(numHours * 3600);
		} catch (err) {
		} finally {
			state = undefined;
		}
	}

	$: date = new Date($time.timestamp * 1000);

	let hours = 1;
</script>

<label class="m-2 font-bold" for="date">Date/Time</label>
<p class="m-2" id="date">{date.toLocaleDateString() + `  ` + date.toLocaleTimeString()}</p>

{#if error}
	{error.message}
	<button class={`btn btn-error m-2`} on:click={() => (error = undefined)}>OK</button>
{:else}
	<Executor func={() => addTime(1)}>Add 1 hours</Executor>
	<Executor func={() => addTime(23)}>Add 23 hours</Executor>
	<form>
		<label for="hours" />
		<input id="hours" type="number" bind:value={hours} />
		<Executor func={() => addTime(hours)}>Add {hours} hours</Executor>
	</form>

	<hr />

	<Executor func={() => addContractTime(1)}>Contract: Add 1 hours</Executor>
	<Executor func={() => addContractTime(23)}>Contract: Add 23 hours</Executor>
	<Executor func={() => addContractTime(1 / 6)}>Contract: Add 10 min</Executor>
	<form>
		<label for="hours" />
		<input id="hours" type="number" bind:value={hours} />
		<Executor func={() => addContractTime(hours)}>Contract: Add {hours} hours</Executor>
	</form>
{/if}

<!-- <Executor func={enableAnvilLogging}>Enable Anvil Logging</Executor> -->

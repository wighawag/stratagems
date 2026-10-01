<script lang="ts">
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {fly} from 'svelte/transition';
	import {admin} from './admin';

	import Executor from '$lib/ui/components/Executor.svelte';
	import {every3Seconds} from '$lib/blockchain/time';
	import {increaseBlockTime, increaseContractTime} from '$utils/debug';

	$: date = new Date($every3Seconds.timestamp * 1000);

	let hours = 1;
</script>

{#if $admin.open}
	<ModalContainer oncancel={() => ($admin.open = false)}>
		<div class="container" transition:fly={{x: '100%'}}>
			<p>Date/Time: {date.toLocaleDateString() + `  ` + date.toLocaleTimeString()}</p>

			<Executor func={increaseBlockTime} args={[1 * 3600]}>Add 1 hours</Executor>
			<Executor func={increaseBlockTime} args={[23 * 3600]}>Add 23 hours</Executor>
			<form class="add-x-hours">
				<label for="hours" />
				<input id="hours" type="number" bind:value={hours} />
				<Executor func={increaseBlockTime} args={[hours * 3600]}>Add {hours} hours</Executor>
			</form>
			<hr />
			<Executor func={increaseContractTime} args={[1 * 3600]}>Contract: Add 1 hour</Executor>
			<Executor func={increaseContractTime} args={[23 * 3600]}>Contract: Add 23 hours</Executor>
			<Executor func={increaseContractTime} args={[(1 * 3600) / 6]}>Contract: Add 10 min</Executor>
			<form>
				<label for="hours" />
				<input id="hours" type="number" bind:value={hours} />
				<Executor func={increaseContractTime} args={[hours * 3600]}>Contract: Add {hours} hours</Executor>
			</form>

			<!-- <Executor func={enableAnvilLogging}>Enable Anvil Logging</Executor> -->

			<!-- <Executor func={enableAnvilLogging}>Enable Anvil Logging</Executor> -->
			<!-- <Executor func={enableAnvilLogging}>Enable Anvil Logging</Executor> -->
			<style>
				.add-x-hours {
					display: flex;
					flex-wrap: wrap;
				}

				.add-x-hours input {
					background-color: black;
					color: white;
				}
			</style>
		</div>
	</ModalContainer>
{/if}

<style>
	.container {
		width: 100%;
		top: 2rem;
		pointer-events: auto;
		cursor: default;
		position: absolute;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: start;
		gap: 0.25rem;
		align-items: center;
		right: 0;
		list-style: none;
		padding: 16px;
		border-radius: 16px;

		background-color: var(--color-surface-800);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 fill;
		image-rendering: pixelated;
	}
</style>

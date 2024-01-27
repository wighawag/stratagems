<script lang="ts">
	import {createExecutor, type Executor} from '$utils/debug';
	import Banner from '$utils/ui/banners/Banner.svelte';
	import {onDestroy} from 'svelte';

	export let func: (...args: any[]) => Promise<any>;
	export let args: any[] = [];

	let executor: Executor<any, any>;
	$: executor = createExecutor(func);
	onDestroy(() => {
		executor.acknowledgeError();
	});
</script>

<div>
	{#if $executor.error}
		<Banner>
			<div class="banner">
				<p>{$executor.error}</p>
				<button class="error" on:click={() => executor.acknowledgeError()}>Ok</button>
			</div>
		</Banner>
	{/if}
	<button disabled={$executor.executing || $executor.error} class="success" on:click={() => executor.execute(...args)}
		><slot /></button
	>
</div>

<style>
	.banner {
		text-align: center;
	}
	button {
		margin: 1rem 0rem 0rem 0rem;
	}
</style>

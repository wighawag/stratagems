<script lang="ts">
	import {createExecutor} from '$utils/debug';
	import Banner from '$utils/ui/banners/Banner.svelte';

	export let func: (...args: any[]) => Promise<any>;
	export let args: any[] = [];

	const execution = createExecutor(func);
</script>

<div>
	{#if $execution.error}
		<Banner>
			<p>{$execution.error}</p>
			<button class="error" on:click={() => execution.acknowledgeError()}>Ok</button>
		</Banner>
	{/if}
	<button
		disabled={$execution.executing || $execution.error}
		class="success"
		on:click={() => execution.execute(...args)}><slot /></button
	>
</div>

<style>
	button {
		margin: 0.5rem;
	}
</style>

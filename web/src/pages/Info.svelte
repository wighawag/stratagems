<script lang="ts">
	import {browserIndexer, state} from '$app/state/State';
	import JSONTree from 'svelte-json-tree';
	import {onMount} from 'svelte';

	onMount(() => {
		document.body.style.backgroundColor = 'white';
	});

	function addLengthToFields(v: any): any {
		const keys = Object.keys(v);
		const n = {};
		for (const key of keys) {
			if (typeof v[key] === 'object') {
				n[key + ` (${Object.keys(v[key]).length})`] = v[key];
			} else {
				n[key] = v[key];
			}
		}
		return n;
	}
	$: stateDisplayed = addLengthToFields($state);
</script>

<div id="wrap">
	<progress value={($browserIndexer?.syncPercentage || 0) / 100} style="width:100%;" />

	<p>block processed: {$browserIndexer?.numBlocksProcessedSoFar.toLocaleString()}</p>
	<p>num events: {$browserIndexer?.nextStreamID.toLocaleString()}</p>

	{#if $state}
		<JSONTree value={stateDisplayed} />
	{:else if $browserIndexer}
		<JSONTree value={$browserIndexer} />
	{/if}
</div>

<script lang="ts">
	import {status, state, syncing} from '$lib/state/State';
	import RadialProgress from '$utils/progress/RadialProgress.svelte';
	import {JsonView} from '@zerodevx/svelte-json-view';

	// import JSONTree from 'svelte-json-tree';

	function addLengthToFields(v: any): any {
		const keys = Object.keys(v);
		const n = {};
		for (const key of keys) {
			if (typeof v[key] === 'object') {
				(n as any)[key + ` (${Object.keys(v[key]).length})`] = v[key];
			} else {
				(n as any)[key] = v[key];
			}
		}
		return n;
	}
	$: stateDisplayed = $state && addLengthToFields($state);
</script>

<p>Indexer State</p>

<RadialProgress value={$syncing.lastSync?.syncPercentage || 0} style="margin-bottom:1rem;" />

<div>Syncing</div>

<JsonView json={$syncing} depth={0} />

<div>State</div>

{#if $state}
	<JsonView json={stateDisplayed} depth={0} />
{:else}
	<JsonView json={$syncing} />
{/if}

<style>
	p {
		margin-block: 1rem;
	}
</style>

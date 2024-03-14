<script lang="ts">
	import {status, state, syncing} from '$lib/state/State';
	import RadialProgress from '$utils/progress/RadialProgress.svelte';
	import {JsonView} from '@zerodevx/svelte-json-view';
	import {indexerView} from './indexerView';
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {fly} from 'svelte/transition';
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
	function transform(json: any): any {
		if (typeof json === 'bigint') {
			return json.toString();
		} else if (typeof json === 'object') {
			if (Array.isArray(json)) {
				return json.map(transform);
			} else {
				const keys = Object.keys(json);
				const n = {} as any;
				for (const key of keys) {
					n[key] = transform(json[key]);
				}
				return n;
			}
		}
		return json;
	}
	$: stateDisplayed = $state && transform(addLengthToFields($state));
</script>

{#if $indexerView.open}
	<ModalContainer oncancel={() => ($indexerView.open = false)}>
		<div class="container" transition:fly={{x: '100%'}}>
			<RadialProgress value={$syncing.lastSync?.syncPercentage || 0} style="margin-bottom:1rem;" />

			<div>Syncing</div>

			<JsonView json={$syncing} depth={0} />

			<div>State</div>

			{#if $state}
				<JsonView json={stateDisplayed} depth={0} />
			{:else}
				<JsonView json={$syncing} />
			{/if}
		</div>
	</ModalContainer>
{/if}

<style>
	.container {
		width: 100%;
		top: 2rem;
		right: 0;
		height: calc(100% - 2rem);
		overflow: auto;

		pointer-events: auto;
		cursor: default;
		position: absolute;

		display: flex;
		flex-direction: column;
		justify-content: start;
		gap: 0.25rem;

		padding: 16px;
		border-radius: 16px;

		background-color: var(--color-surface-800);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 fill;
		image-rendering: pixelated;
	}
</style>

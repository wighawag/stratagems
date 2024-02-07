<script lang="ts">
	import {JsonView} from '@zerodevx/svelte-json-view';
	import {viewStateView} from './viewStateView';
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {fly} from 'svelte/transition';
	import {stratagemsView} from '$lib/state/ViewState';
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
	$: stateDisplayed = $stratagemsView && addLengthToFields($stratagemsView);
</script>

{#if $viewStateView.open}
	<ModalContainer oncancel={() => ($viewStateView.open = false)}>
		<div class="container" transition:fly={{x: '100%'}}>
			<JsonView json={stateDisplayed} depth={1} />
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

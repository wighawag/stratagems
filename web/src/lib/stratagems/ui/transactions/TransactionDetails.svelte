<script lang="ts">
	import {transactionDetailsView} from './transactionsView';
	import {JsonView} from '@zerodevx/svelte-json-view';
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {fly} from 'svelte/transition';
	// import {account, connection} from '$lib/blockchain/connection';

	// export async function force() {
	// 	if (connection.$state.provider && account.$state.address) {
	// 		const nonce = await connection.$state.provider.request({
	// 			method: 'eth_getTransactionCount',
	// 			params: [account.$state.address, 'latest'],
	// 		});
	// 		console.log({nonce: Number(nonce)});
	// 		await connection.$state.provider.request({
	// 			method: 'eth_sendTransaction',
	// 			params: [{...$transactionDetailsView.tx, nonce}],
	// 		});
	// 	} else {
	// 		//TODO
	// 	}
	// }
</script>

{#if $transactionDetailsView.tx}
	<ModalContainer oncancel={() => ($transactionDetailsView.tx = undefined)}>
		<div class="container" transition:fly={{y: '100%'}}>
			<JsonView json={$transactionDetailsView.tx} depth={0} />
			<!-- <div>
				<button on:click={() => force()}>force</button>
			</div> -->
		</div>
	</ModalContainer>
{/if}

<style>
	.container {
		top: 2rem;
		right: 0;
		width: 100%;
		height: calc(100% - 2rem);
		overflow-y: auto;

		pointer-events: auto;
		cursor: default;
		position: absolute;

		display: flex;
		flex-direction: column;
		justify-content: start;
		gap: 0.25rem;

		list-style: none;
		padding: 16px;
		border-radius: 16px;

		background-color: var(--color-surface-800);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 fill;
		image-rendering: pixelated;
	}
</style>

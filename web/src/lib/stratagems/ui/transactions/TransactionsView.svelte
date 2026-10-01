<script lang="ts">
	import {txObserver} from '$lib/blockchain/connection';
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {transactionsView} from './transactionsView';
	import {fly} from 'svelte/transition';
	import {Render, Subscribe, createRender, createTable} from 'svelte-headless-table';
	import {addSortBy} from 'svelte-headless-table/plugins';
	import TransactionInfo from './TransactionInfo.svelte';
	import TransactionDetailsButton from './TransactionDetailsButton.svelte';
	import TransactionDetails from './TransactionDetails.svelte';

	// import {accountData} from '$lib/blockchain/connection';
	// const actions = accountData.onchainActions;
	// $: transactions = Object.keys($actions).map((v) => ({hash: v, transaction: ($actions as any)[v]}));

	const transactions = txObserver.txs;

	const table = createTable(transactions, {
		sort: addSortBy(),
	});
	const columns = table.createColumns([
		table.column({
			header: 'hash',
			accessor: (tx) => tx,
			cell: ({value}) =>
				createRender(TransactionInfo, {
					tx: value,
				}),
		}),
		table.column({
			header: 'type',
			accessor: (tx) => tx.request.metadata?.type || 'Unknown',
		}),
		table.column({
			header: 'status',
			accessor: 'status',
		}),
		table.column({
			header: '',
			accessor: (tx) => tx,
			cell: ({value}) =>
				createRender(TransactionDetailsButton, {
					tx: value,
				}),
		}),
	]);

	const {headerRows, rows, tableAttrs, tableBodyAttrs} = table.createViewModel(columns);
</script>

{#if $transactionsView.open}
	<ModalContainer oncancel={() => ($transactionsView.open = false)}>
		<div class="container" transition:fly={{x: '100%'}}>
			<table {...$tableAttrs}>
				<thead>
					{#each $headerRows as headerRow (headerRow.id)}
						<Subscribe rowAttrs={headerRow.attrs()} let:rowAttrs>
							<tr {...rowAttrs}>
								{#each headerRow.cells as cell (cell.id)}
									<Subscribe attrs={cell.attrs()} let:attrs>
										<th {...attrs}>
											<Render of={cell.render()} />
										</th>
									</Subscribe>
								{/each}
							</tr>
						</Subscribe>
					{/each}
				</thead>
				<tbody {...$tableBodyAttrs}>
					{#each $rows as row (row.id)}
						<Subscribe rowAttrs={row.attrs()} let:rowAttrs>
							<tr {...rowAttrs}>
								{#each row.cells as cell (cell.id)}
									<Subscribe attrs={cell.attrs()} let:attrs>
										<td {...attrs}>
											<Render of={cell.render()} />
										</td>
									</Subscribe>
								{/each}
								<!-- {#if row.original.type}
									<td><button on:click={() => showDetails(row)}>Details</button></td>
								{/if} -->
							</tr>
						</Subscribe>
					{/each}
				</tbody>
			</table>
		</div>
	</ModalContainer>
{/if}

<TransactionDetails />

<style>
	table {
		width: 100%;
	}
	th {
		text-align: start;
	}
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

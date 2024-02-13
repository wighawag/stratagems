<script lang="ts">
	import {accountData} from '$lib/blockchain/connection';
	import {Render, Subscribe, createRender, createTable} from 'svelte-headless-table';
	import {addSortBy} from 'svelte-headless-table/plugins';
	import {derived, type Readable} from 'svelte/store';
	import TransactionInfo from '../transactions/TransactionInfo.svelte';
	import {commitmentsView} from './commitmentsView';
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import CommitmentDetails from './CommitmentDetails.svelte';
	import {fly} from 'svelte/transition';
	import CommitmentDetailsButton from './CommitmentDetailsButton.svelte';
	import type {OnChainAction} from '$lib/account/base';
	import type {CommitMetadata} from '$lib/account/account-data';
	import CommitmentRevealInfo from './CommitmentRevealInfo.svelte';

	const onchainActions = accountData.onchainActions;
	const commitments: Readable<{hash: `0x${string}`; action: OnChainAction<CommitMetadata>}[]> = derived(
		onchainActions,
		($onchainActions) =>
			Object.keys($onchainActions)
				.filter((k) => $onchainActions[k as `0x${string}`].tx.metadata?.type === 'commit')
				.map((k) => ({
					hash: k as `0x${string}`,
					action: $onchainActions[k as `0x${string}`] as OnChainAction<CommitMetadata>,
				})),
	);

	const table = createTable(commitments, {
		sort: addSortBy(),
	});
	const columns = table.createColumns([
		table.column({
			header: 'hash',
			accessor: (commitment) => commitment,
			cell: ({value}) =>
				createRender(TransactionInfo, {
					tx: {hash: value.hash, inclusion: value.action.inclusion},
				}),
		}),
		table.column({
			header: 'Epoch',
			accessor: (commitment) => commitment.action.tx.metadata?.epoch || 'Unknown',
		}),
		table.column({
			header: 'Reveal',
			accessor: (commitment) => commitment,
			cell: ({value}) =>
				createRender(CommitmentRevealInfo, {
					commitment: value,
				}),
		}),

		table.column({
			header: '',
			accessor: (commitment) => commitment,
			cell: ({value}) =>
				createRender(CommitmentDetailsButton, {
					commitment: value.action,
				}),
		}),
	]);

	const {headerRows, rows, tableAttrs, tableBodyAttrs} = table.createViewModel(columns);
</script>

{#if $commitmentsView.open}
	<ModalContainer oncancel={() => ($commitmentsView.open = false)}>
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

<CommitmentDetails />

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

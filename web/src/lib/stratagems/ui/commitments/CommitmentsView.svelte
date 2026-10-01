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
	import type {CommitCancelMetadata, OnChainAction} from '$lib/account/base';
	import type {CommitMetadata} from '$lib/account/account-data';
	import CommitmentRevealInfo from './CommitmentRevealInfo.svelte';

	const onchainActions = accountData.onchainActions;
	const commitments: Readable<
		{
			hash: `0x${string}`;
			action: OnChainAction<CommitMetadata>;
			replaced: boolean;
			canceled: boolean;
		}[]
	> = derived(onchainActions, ($onchainActions) => {
		const onChainActionsTransformedAndSorted: {
			hash: `0x${string}`;
			action: OnChainAction<CommitMetadata>;
			replaced: boolean;
			canceled: boolean;
		}[] = Object.keys($onchainActions)
			.map((actionhash) => {
				return {
					action: $onchainActions[actionhash as `0x${string}`] as OnChainAction<CommitMetadata>,
					hash: actionhash as `0x${string}`,
					replaced: false,
					canceled: false,
				};
			})
			.filter((v) => v.action.tx.metadata?.type === 'commit' || v.action.tx.metadata?.type === 'commit-cancel')
			.sort((a, b) => {
				if (
					(a.action.tx.nonce && b.action.tx.nonce && Number(a.action.tx.nonce) < Number(b.action.tx.nonce)) ||
					(a.action.tx.timestamp && b.action.tx.timestamp && a.action.tx.timestamp < b.action.tx.timestamp)
				) {
					return -1;
				} else {
					return 1;
				}
			});

		let lastAction:
			| {
					hash: `0x${string}`;
					action: OnChainAction<CommitMetadata | CommitCancelMetadata>;
					replaced: boolean;
					canceled: boolean;
			  }
			| undefined;
		for (const fullAction of onChainActionsTransformedAndSorted) {
			const action = fullAction.action;
			if (action.tx.metadata && action.status !== 'Failure') {
				const metadata = action.tx.metadata;
				if (metadata.type === 'commit') {
					if (lastAction && lastAction.action.tx.metadata.epoch == metadata.epoch) {
						lastAction.replaced = true;
					}
					lastAction = fullAction;
				} else if (metadata.type == 'commit-cancel') {
					if (lastAction && lastAction.action.tx.metadata.epoch == metadata.epoch) {
						lastAction.canceled = true;
					}
					lastAction = fullAction;
				}
			}
		}

		return onChainActionsTransformedAndSorted.filter((v) => v.action.tx.metadata?.type === 'commit');
	});

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

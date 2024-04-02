<script lang="ts">
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {eventsView} from './eventsView';
	import {fly} from 'svelte/transition';
	import {Render, Subscribe, createRender, createTable} from 'svelte-headless-table';
	import {addSortBy} from 'svelte-headless-table/plugins';
	import {state} from '$lib/state/State';
	import {derived} from 'svelte/store';
	import EventInfo from './EventInfo.svelte';
	import type {CellPlacements} from 'stratagems-indexer';
	import {bigIntIDToXY} from 'stratagems-common';
	import PositionInfo from '../components/PositionInfo.svelte';

	type Placements = {
		epoch: number;
		position: bigint;
		cells: CellPlacements;
	}[];

	const events = derived(state, ($state) => {
		const placements: Placements = [];
		for (const epochPlacements of $state.placements) {
			for (const position of Object.keys(epochPlacements.cells)) {
				placements.push({
					epoch: epochPlacements.epoch,
					position: BigInt(position),
					cells: epochPlacements.cells[position],
				});
			}
		}
		return placements;
	});

	const table = createTable(events, {
		sort: addSortBy(),
	});
	const columns = table.createColumns([
		table.column({
			header: 'epoch',
			accessor: 'epoch',
		}),
		table.column({
			header: 'position',
			accessor: (event) => {
				const {x, y} = bigIntIDToXY(event.position);
				return {x, y};
			},
			cell: ({value}) => createRender(PositionInfo, value),
		}),
		table.column({
			header: 'players',
			accessor: (event) => event,
			cell: ({value}) =>
				createRender(EventInfo, {
					event: value.cells,
				}),
		}),
	]);

	const {headerRows, rows, tableAttrs, tableBodyAttrs} = table.createViewModel(columns);
</script>

{#if $eventsView.open}
	<ModalContainer oncancel={() => ($eventsView.open = false)}>
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

<style>
	table {
		width: 100%;
	}
	th {
		text-align: start;
		padding-bottom: 1rem;
	}
	td {
		padding-bottom: 0.5rem;
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

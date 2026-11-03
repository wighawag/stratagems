<!--
	A STARTED TABLE'S SEATS, how far it is ("cycle 2 of 10", or ended), and the
	creator's forfeit, over the board. Before the start the table's page is
	`TableLobby.svelte`.

	Renders `$lib/game/lobby/table`'s store and decides nothing: whom the
	creator may forfeit is the contract's rule, so a press the contract refuses
	comes back as the store's failure message.
-->
<script lang="ts">
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {
		describeTableProgress,
		memberLabel,
		tableProgressOf,
		type TableStore,
	} from '$lib/game/lobby/table';

	interface Props {
		table: TableStore;
	}

	let {table}: Props = $props();
	const action = $derived(table.action);

	const short = (address: string) =>
		`${address.slice(0, 6)}...${address.slice(-4)}`;
</script>

<div
	class="pointer-events-auto w-64 rounded-lg bg-background/85 p-3 text-sm shadow-lg backdrop-blur"
	data-testid="table-panel"
>
	<p class="font-semibold">Table {short(table.address)}</p>
	{#if $table.step === 'Loading'}
		<p class="text-xs text-muted-foreground">Reading the table...</p>
	{:else if $table.step === 'Failed'}
		<p class="text-xs text-red-400">{$table.message}</p>
	{:else}
		{@const progress = tableProgressOf($table.roster)}
		<p class="text-xs text-muted-foreground">
			{$table.roster.members.length} playing{#if progress}, <span
					data-testid="table-progress"
					data-ended={progress.step === 'ended'}
					>{describeTableProgress(progress)}</span
				>{/if}
		</p>
		<ul class="mt-2 flex flex-col gap-1" data-testid="table-seats">
			{#each $table.table as seat, index (index)}
				<li class="flex items-center justify-between gap-2">
					<span class="text-xs">
						{#if seat.occupant === undefined}
							<span class="text-muted-foreground">Empty seat</span>
						{:else if seat.occupant.kind === 'you'}
							You
						{:else if seat.occupant.kind === 'remote-human'}
							{memberLabel(seat.occupant.player)}
						{/if}
					</span>
					{#if $table.isCreator && $table.roster.started && !$table.roster.ended && seat.occupant?.kind === 'remote-human'}
						<Button
							size="sm"
							variant="outline"
							class="h-6 px-2 text-xs"
							data-testid="table-forfeit"
							disabled={$action.step === 'Sending'}
							onclick={() =>
								seat.occupant?.kind === 'remote-human' &&
								table.forfeit(seat.occupant.player)}>Forfeit</Button
						>
					{/if}
				</li>
			{/each}
		</ul>
		{#if $action.step === 'Failed'}
			<p class="mt-2 text-xs text-red-400">{$action.message}</p>
		{/if}
	{/if}
</div>

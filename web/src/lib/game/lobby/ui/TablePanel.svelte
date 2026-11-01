<!--
	A TABLE'S SEATS AND ITS CREATOR'S TWO PRESSES, over the board.

	Renders `$lib/game/lobby/table`'s store and decides nothing: who may start
	and whom the creator may forfeit are the contract's rules, so a press the
	contract refuses comes back as the store's failure message. The invite link
	is this page's address, which already names the table.
-->
<script lang="ts">
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import type {TableStore} from '$lib/game/lobby/table';

	interface Props {
		table: TableStore;
		/** The link that opens this table: what the creator sends to the others. */
		inviteLink: string;
	}

	let {table, inviteLink}: Props = $props();
	const action = $derived(table.action);

	let copied = $state(false);
	async function copyInvite() {
		await navigator.clipboard?.writeText(inviteLink);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

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
		<p class="text-xs text-muted-foreground" data-testid="table-status">
			{#if $table.roster.started}
				Started: {$table.roster.members.length} playing
			{:else}
				Waiting to start: {$table.roster.members.length} of {$table.roster
					.seats} seats taken
			{/if}
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
							{short(seat.occupant.address)}
						{/if}
					</span>
					{#if $table.isCreator && $table.roster.started && seat.occupant?.kind === 'remote-human'}
						<Button
							size="sm"
							variant="outline"
							class="h-6 px-2 text-xs"
							data-testid="table-forfeit"
							disabled={$action.step === 'Sending'}
							onclick={() =>
								seat.occupant?.kind === 'remote-human' &&
								table.forfeit(BigInt(seat.occupant.address))}>Forfeit</Button
						>
					{/if}
				</li>
			{/each}
		</ul>
		{#if !$table.roster.started}
			<div class="mt-2 flex flex-col gap-2">
				<Button
					size="sm"
					variant="outline"
					data-testid="table-invite"
					onclick={() => void copyInvite()}
					>{copied ? 'Link copied' : 'Copy the invite link'}</Button
				>
				{#if $table.isCreator}
					<Button
						size="sm"
						data-testid="table-start"
						disabled={$action.step === 'Sending' ||
							$table.roster.members.length < 2}
						onclick={() => void table.start()}
						>{$action.step === 'Sending' ? 'Starting...' : 'Start'}</Button
					>
				{/if}
			</div>
		{/if}
		{#if $action.step === 'Failed'}
			<p class="mt-2 text-xs text-red-400">{$action.message}</p>
		{/if}
	{/if}
</div>

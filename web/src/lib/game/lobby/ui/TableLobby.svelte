<!--
	A TABLE BEFORE ITS START: what it plays by, who has taken a seat, and what
	this person is waiting for. Shown over the board until the creator starts
	the game, and to anyone not seated once they have.

	Renders `$lib/game/lobby/table`'s `screen` and decides nothing. Taking a seat
	is the GAME'S control (what it sells, how it is paid for), so it arrives as
	the `takeSeat` snippet; this component only says when it is offered.
-->
<script lang="ts">
	import type {Snippet} from 'svelte';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {
		describeDuration,
		memberLabel,
		type TableSettings,
		type TableStore,
	} from '$lib/game/lobby/table';

	interface Props {
		table: TableStore;
		/** The link that opens this table: what the creator sends to the others. */
		inviteLink: string;
		settings: TableSettings;
		/**
		 * The game's control for taking a seat (its stake, and the sign-in
		 * before it), offered while this person holds no seat and one is free.
		 * Once seated there is nothing to ask: the stake authorised this
		 * browser in the same transaction.
		 */
		takeSeat?: Snippet;
		/** What the game's options at this table mean (`TableLobby.options.describe`). */
		details?: readonly {label: string; value: string}[];
	}

	let {table, inviteLink, settings, takeSeat, details = []}: Props = $props();
	const screen = $derived(table.screen);
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
	class="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
	data-testid="table-lobby"
>
	<div class="w-full max-w-md rounded-lg border bg-background p-5 shadow-xl">
		<p class="text-lg font-semibold">Table {short(table.address)}</p>
		{#if $screen.screen === 'loading'}
			<p class="mt-2 text-sm text-muted-foreground">Reading the table...</p>
		{:else if $screen.screen === 'failed'}
			<p class="mt-2 text-sm text-red-400">{$screen.message}</p>
		{:else if $screen.screen === 'closed'}
			<p class="mt-2 text-sm" data-testid="table-status">{$screen.status}</p>
		{:else if $screen.screen === 'lobby' && $table.step === 'Loaded'}
			<p class="text-xs text-muted-foreground">
				Created by {$screen.isCreator ? 'you' : short($table.roster.creator)}
			</p>

			<dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
				<dt class="text-muted-foreground">Seats</dt>
				<dd>{$screen.seats}</dd>
				<dt class="text-muted-foreground">Cycles</dt>
				<dd data-testid="table-cycles">{$table.roster.cycles}</dd>
				{#each details as detail (detail.label)}
					<dt class="text-muted-foreground">{detail.label}</dt>
					<dd>{detail.value}</dd>
				{/each}
				<dt class="text-muted-foreground">To commit a turn</dt>
				<dd>{describeDuration(settings.commitPhaseDuration)}</dd>
				<dt class="text-muted-foreground">To reveal it</dt>
				<dd>{describeDuration(settings.revealPhaseDuration)}</dd>
			</dl>
			{#if settings.earlyAdvance}
				<p class="mt-1 text-xs text-muted-foreground">
					A phase ends early as soon as every player has acted.
				</p>
			{/if}

			<ul class="mt-4 flex flex-col gap-1 text-sm" data-testid="table-seats">
				{#each $table.table as seat, index (index)}
					<li>
						{#if seat.occupant === undefined}
							<span class="text-muted-foreground">Empty seat</span>
						{:else if seat.occupant.kind === 'you'}
							You
						{:else if seat.occupant.kind === 'remote-human'}
							{memberLabel(seat.occupant.player)}
						{/if}
					</li>
				{/each}
			</ul>

			<p class="mt-4 text-sm" data-testid="table-status">{$screen.status}</p>

			{#if !$screen.seated && $screen.seatFree && takeSeat}
				<div class="mt-3">{@render takeSeat()}</div>
			{/if}

			<div class="mt-4 flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="outline"
					data-testid="table-invite"
					onclick={() => void copyInvite()}
					>{copied ? 'Link copied' : 'Copy the invite link'}</Button
				>
				{#if $screen.isCreator}
					<Button
						size="sm"
						data-testid="table-start"
						disabled={$action.step === 'Sending' || !$screen.canStart}
						onclick={() => void table.start()}
						>{$action.step === 'Sending'
							? 'Starting...'
							: 'Start the game'}</Button
					>
				{/if}
			</div>
			{#if $action.step === 'Failed'}
				<p class="mt-2 text-xs text-red-400">{$action.message}</p>
			{/if}
		{/if}
	</div>
</div>

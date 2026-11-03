<!--
	TABLES: games for a fixed set of players, beside the world.

	Anyone creates one, with the number of seats and of cycles it plays (it ends
	after the last); anyone with its link takes a
	free seat by staking at it; its creator starts it once two are seated. Each
	table is an address of its own, and the game at a table is the same page as
	the world's (`/play/?game=<address>`), so opening one is a page load: the app
	is composed for one game, once.

	THE ROUTE RENDERS `$lib/game/lobby/table`'s store and decides nothing: which
	tables exist is the factory's answer, and the rules of a seat are the
	contract's. A game with no tables exports no `lobby`, and this page says so.
-->
<script lang="ts">
	import {onMount} from 'svelte';
	import {getAppContext, route} from '$lib';
	import DefaultHead from '$lib/metadata/DefaultHead.svelte';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {lobby} from '$lib/context/index';
	import {
		clampTableCycles,
		createTablesLobby,
		DEFAULT_TABLE_CYCLES,
		defaultOptionValues,
		encodeTableOptions,
		FEWEST_TABLE_CYCLES,
		FEWEST_TABLE_SEATS,
		MOST_TABLE_CYCLES,
		MOST_TABLE_SEATS,
	} from '$lib/game/lobby/table';

	const context = getAppContext();
	const tablesLobby = lobby
		? createTablesLobby({deps: context, lobby})
		: undefined;
	const tables = tablesLobby?.tables;
	const creating = tablesLobby?.creating;

	const choices = Array.from(
		{length: MOST_TABLE_SEATS - FEWEST_TABLE_SEATS + 1},
		(_, i) => FEWEST_TABLE_SEATS + i,
	);
	let seats = $state(3);
	let cycles = $state(DEFAULT_TABLE_CYCLES);
	// the game's own choices, if it has any (`TableLobby.options`)
	const gameOptions = lobby?.options;
	let optionValues = $state<Record<string, number>>(
		gameOptions ? defaultOptionValues(gameOptions) : {},
	);

	const linkTo = (table: string) => route(`/play/?game=${table}`);
	const short = (address: string) =>
		`${address.slice(0, 6)}...${address.slice(-4)}`;

	async function create() {
		const table = await tablesLobby?.create(seats, {
			cycles: clampTableCycles(cycles),
			...(gameOptions
				? {gameOptions: encodeTableOptions(gameOptions, optionValues)}
				: {}),
		});
		// A table is a context of its own: a page load, not a navigation.
		if (table) location.assign(linkTo(table));
	}

	onMount(() => {
		void tablesLobby?.refresh();
		const timer = setInterval(() => void tablesLobby?.refresh(), 5000);
		return () => clearInterval(timer);
	});
</script>

<DefaultHead title={'Tables'} />

<div class="container mx-auto max-w-2xl px-4 py-12">
	<h1 class="text-lg font-semibold">Tables</h1>
	{#if !tablesLobby || !tables || !creating}
		<p class="mt-2 text-sm text-muted-foreground">This game has no tables.</p>
	{:else}
		<p class="mt-2 text-sm text-muted-foreground">
			A game for a fixed set of players. Create one and send its link: whoever
			opens it takes a free seat by staking, and you start it once two or more
			are seated.
		</p>

		<div class="mt-6 rounded-lg border p-4">
			<p class="text-sm font-medium">How many seats?</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each choices as choice (choice)}
					<Button
						size="sm"
						variant={choice === seats ? 'default' : 'outline'}
						data-testid={`table-seats-${choice}`}
						onclick={() => (seats = choice)}>{choice}</Button
					>
				{/each}
			</div>
			<label class="mt-4 block text-sm font-medium" for="table-cycles"
				>How many cycles? <span class="font-normal text-muted-foreground"
					>({FEWEST_TABLE_CYCLES} to {MOST_TABLE_CYCLES}; the game ends after
					the last)</span
				></label
			>
			<input
				id="table-cycles"
				class="mt-2 w-24 rounded-md border bg-background px-2 py-1 text-sm"
				type="number"
				min={FEWEST_TABLE_CYCLES}
				max={MOST_TABLE_CYCLES}
				data-testid="table-cycles"
				bind:value={cycles}
			/>
			{#if gameOptions}
				{#each gameOptions.fields as field (field.id)}
					<label
						class="mt-4 block text-sm font-medium"
						for={`table-option-${field.id}`}
						>{field.label}
						<span class="font-normal text-muted-foreground"
							>({field.min} to {field.max}{field.unit
								? ` ${field.unit}`
								: ''})</span
						></label
					>
					<input
						id={`table-option-${field.id}`}
						class="mt-2 w-24 rounded-md border bg-background px-2 py-1 text-sm"
						type="number"
						min={field.min}
						max={field.max}
						data-testid={`table-option-${field.id}`}
						bind:value={optionValues[field.id]}
					/>
				{/each}
			{/if}
			<Button
				class="mt-4 block"
				data-testid="table-create"
				disabled={$creating?.step === 'Creating'}
				onclick={() => void create()}
				>{$creating?.step === 'Creating'
					? 'Creating...'
					: 'Create a table'}</Button
			>
			{#if $creating?.step === 'Failed'}
				<p class="mt-2 text-xs text-red-400">{$creating.message}</p>
			{/if}
		</div>

		<h2 class="mt-8 text-sm font-semibold">Open tables</h2>
		{#if $tables?.step === 'Loading' || $tables?.step === 'Idle'}
			<p class="mt-2 text-sm text-muted-foreground">Reading the tables...</p>
		{:else if $tables?.step === 'Failed'}
			<p class="mt-2 text-sm text-red-400">{$tables.message}</p>
		{:else if $tables?.step === 'Loaded'}
			{#if $tables.tables.length === 0}
				<p class="mt-2 text-sm text-muted-foreground">No table yet.</p>
			{:else}
				<ul class="mt-2 flex flex-col gap-2" data-testid="tables">
					{#each $tables.tables as table (table.address)}
						<li class="flex items-center justify-between rounded-md border p-3">
							<span class="text-sm">
								{short(table.address)}
								<span class="text-muted-foreground">
									by {short(table.creator)}, {table.members.length} of {table.seats}
									seats, {table.cycles} cycles{table.ended
										? ', ended'
										: table.started
											? ', started'
											: ''}
								</span>
							</span>
							<Button
								size="sm"
								variant="outline"
								href={linkTo(table.address)}
								data-sveltekit-reload>Open</Button
							>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</div>

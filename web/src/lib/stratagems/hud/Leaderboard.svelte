<!--
	The leaderboard, a drawer toggled from the HUD (P3 of step 6c): every player
	the rewards generator knows, ranked by gems earned. Logic-less: the ranking is
	`../leaderboard.ts`'s, the labels `./panels.ts`'s; `open` is local UI state.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {derived} from 'svelte/store';
	import {getAppContext} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {describeLeaderboard} from './panels';

	const {game} = getAppContext();
	const rows = derived(game.leaderboard, ($rows) =>
		describeLeaderboard($rows, {
			decimals: game.config.currency.decimals,
			numTokensPerGems: game.config.numTokensPerGems,
		}),
	);
	let open = $state(false);
</script>

<div class="pointer-events-auto flex flex-col items-end">
	<Button
		size="sm"
		variant="outline"
		data-testid="leaderboard-toggle"
		onclick={() => (open = !open)}
	>
		{open ? 'Hide leaderboard' : 'Leaderboard'}
	</Button>
	{#if open}
		<div
			class="mt-2 max-h-[50vh] w-72 overflow-auto rounded-lg bg-background/90 p-3 shadow-lg backdrop-blur"
			data-testid="leaderboard"
		>
			{#if $rows.length === 0}
				<p class="text-xs text-muted-foreground">Nobody has scored yet.</p>
			{:else}
				<table class="w-full text-xs">
					<thead class="text-muted-foreground">
						<tr>
							<th class="text-left">#</th>
							<th class="text-left">Player</th>
							<th class="text-right">Cells</th>
							<th class="text-right">Points</th>
							<th class="text-right">Earned</th>
						</tr>
					</thead>
					<tbody>
						{#each $rows as row (row.rank)}
							<tr class={row.mine ? 'font-semibold text-amber-400' : ''}>
								<td>{row.rank}</td>
								<td>{row.player}</td>
								<td class="text-right">{row.lands}</td>
								<td class="text-right">{row.points}</td>
								<td class="text-right">{row.earned}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	{/if}
</div>

<!--
	The cell panel: the last cell clicked, what is on it and, when a click on it
	planned nothing, why (the legacy InfoBar's cell half); on the player's own
	full-life cell it is the land menu, offering its removal (P6 of step 6c).
	Logic-less: the model is `./panels.ts`'s `describeCell`.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {derived} from 'svelte/store';
	import {getAppContext} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {describeCell} from './panels';

	const context = getAppContext();
	const {game} = context;
	const planning = game.planning;
	const panel = derived([planning.selected, context.viewState], ([$selected, $view]) =>
		describeCell({selected: $selected, view: $view, maxLife: game.config.maxLife}),
	);
	const selected = planning.selected;
</script>

{#if $panel}
	<div
		class="pointer-events-auto w-64 rounded-lg bg-background/85 p-3 shadow-lg backdrop-blur"
		data-testid="cell-panel"
	>
		<div class="flex items-start justify-between gap-2">
			<p class="text-sm font-semibold">{$panel.title}</p>
			<button
				type="button"
				class="text-xs text-muted-foreground hover:text-foreground"
				aria-label="Close"
				onclick={() => planning.deselect()}>x</button
			>
		</div>
		<div class="mt-1 flex items-center gap-2 text-xs">
			{#if $panel.colour}
				<span class="inline-block h-3 w-3 rounded-sm" style="background-color: {$panel.colour.hex}"></span>
				<span>{$panel.colour.name}</span>
			{/if}
			<span class="text-muted-foreground">{$panel.lifeLabel}</span>
		</div>
		{#if $panel.stakeLabel}
			<p class="mt-1 text-xs text-muted-foreground">{$panel.stakeLabel}</p>
		{/if}
		{#if $panel.ownerLabel}
			<p class="mt-1 text-xs text-muted-foreground">Owner: {$panel.ownerLabel}</p>
		{/if}
		{#if $panel.plannedLabel}
			<p class="mt-1 text-xs text-amber-400">{$panel.plannedLabel}</p>
		{/if}
		{#if $panel.reason}
			<p class="mt-2 text-xs text-amber-400" data-testid="cell-refused">
				{$panel.reason}
			</p>
		{/if}
		{#if $panel.canRemove && $selected}
			<Button
				size="sm"
				variant="destructive"
				class="mt-2"
				data-testid="remove-cell"
				onclick={() => $selected && planning.remove($selected.position)}
			>
				Remove this cell (its gem comes back)
			</Button>
		{/if}
	</div>
{/if}

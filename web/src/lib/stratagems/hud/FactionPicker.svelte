<!--
	The faction picker: the colour the player's placements take (P5 of step 6c).
	Logic-less: the factions and the pick are `../faction.ts`'s.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {getAppContext} from '$lib';
	import {FACTIONS} from '../faction';

	const {game} = getAppContext();
	const faction = game.faction;
</script>

{#if $faction !== undefined}
	<div
		class="pointer-events-auto rounded-lg bg-background/85 p-2 shadow-lg backdrop-blur"
		data-testid="faction-picker"
	>
		<p class="mb-1 text-xs text-muted-foreground">Your colour</p>
		<div class="flex gap-1">
			{#each FACTIONS as option (option.color)}
				<button
					type="button"
					class="h-7 w-7 rounded-md border-2 {option.color === $faction
						? 'border-foreground'
						: 'border-transparent opacity-70 hover:opacity-100'}"
					style="background-color: {option.hex}"
					title={option.name}
					aria-label={option.name}
					aria-pressed={option.color === $faction}
					data-testid="faction-{option.color}"
					onclick={() => faction.pick(option.color)}
				></button>
			{/each}
		</div>
	</div>
{/if}

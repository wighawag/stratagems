<!--
	The faction wash: each faction's living cells on a soft wash of its colour
	(step 9, P9-5), off by default.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {getAppContext} from '$lib';

	const {game} = getAppContext();
	const factionWash = game.factionWash;
</script>

<label
	class="pointer-events-auto flex items-center gap-2 rounded-lg bg-background/85 px-2 py-1 text-xs shadow-lg backdrop-blur"
>
	<input
		type="checkbox"
		bind:checked={$factionWash}
		data-testid="faction-wash"
	/>
	Factions' territory
</label>

<!--
	The card at the top right (step 9, P9-5 and P9-6): the gem the player hovers
	or taps, its owner and what that owner holds, or a dead cell, or an Evil
	cell with its makers and who its death would pay. Logic-less: the model is
	`./focus-card.ts`'s `describeFocus`.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {derived} from 'svelte/store';
	import {getAppContext} from '$lib';
	import ImgBlockie from '$lib/core/ui/ethereum/ImgBlockie.svelte';
	import {COLOURS} from '../faction';
	import {gemColour} from '../render/look';
	import {describeFocus} from './focus-card';
	import {shortAddress} from './panels';

	const context = getAppContext();
	const {game} = context;
	const card = derived([game.focus, context.viewState], ([$key, $view]) =>
		$view.step === 'Loaded'
			? describeFocus({view: $view, key: $key, maxLife: game.config.maxLife})
			: undefined,
	);
</script>

{#snippet who(address: string)}
	<span class="inline-flex items-center gap-1">
		<ImgBlockie {address} class="h-4 w-4 rounded-sm" />
		<span class="font-mono">{shortAddress(address)}</span>
	</span>
{/snippet}

{#snippet life(value: number, max: number, trend: string)}
	<p class="mt-1">
		<span class="tracking-tight"
			>{'●'.repeat(value)}{'○'.repeat(max - value)}</span
		>
		{trend}
	</p>
{/snippet}

{#if $card}
	<div
		class="pointer-events-auto w-64 rounded-lg bg-background/85 p-3 text-xs shadow-lg backdrop-blur"
		data-testid="focus-card"
	>
		{#if $card.kind === 'owner'}
			<p class="text-sm font-semibold">
				{#if $card.owner}{@render who($card.owner)}{/if}
				{#if $card.you}<span class="ml-1">(you)</span>{/if}
			</p>
			{@render life($card.life, $card.maxLife, $card.trendLabel)}
			<p class="text-muted-foreground">
				{$card.friends} friend{$card.friends === 1 ? '' : 's'}, {$card.enemies}
				enem{$card.enemies === 1 ? 'y' : 'ies'}
			</p>
			<p class="mt-1 text-muted-foreground">
				{$card.livingCells} living cell{$card.livingCells === 1 ? '' : 's'},
				{$card.gemsAtStake} gem{$card.gemsAtStake === 1 ? '' : 's'} at stake
			</p>
			<div class="mt-1 flex gap-1">
				{#each $card.colours as colour (colour)}
					<span
						class="inline-block h-3 w-3 rounded-full"
						style="background-color: {gemColour(colour)}"
						title={COLOURS[colour]?.name}
					></span>
				{/each}
			</div>
		{:else if $card.kind === 'dead'}
			<p class="text-sm font-semibold">
				A dead {COLOURS[$card.color]?.name.toLowerCase()} cell
			</p>
			<p class="mt-1 text-muted-foreground">
				Still counts for its neighbours; free to anyone.
			</p>
			{#if $card.lastOwner}
				<p class="mt-1">Last owner {@render who($card.lastOwner)}</p>
			{/if}
		{:else}
			<p class="text-sm font-semibold">
				Evil, {$card.stake} gem{$card.stake === 1 ? '' : 's'} at stake
			</p>
			{@render life($card.life, $card.maxLife, $card.trendLabel)}
			{#if $card.makers}
				<p class="mt-1">Made by a collision of:</p>
				<ul class="ml-1">
					{#each $card.makers as maker (maker)}
						<li>{@render who(maker)}</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-1">Made by a collision of {$card.collision} players.</p>
			{/if}
			<p class="mt-1 text-muted-foreground">
				{#if $card.life <= 0}
					Dead: its gems went to its enemies' owners.
				{:else if $card.paysTo.length > 0}
					If it dies, its gems go to its enemies' owners:
				{:else}
					If it dies, its gems go to its enemies' owners; it has none yet.
				{/if}
			</p>
			{#if $card.life > 0 && $card.paysTo.length > 0}
				<ul class="ml-1">
					{#each $card.paysTo as owner (owner)}
						<li>{@render who(owner)}</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
{/if}

<!--
	THE HANDOVER of a hotseat world: what covers the whole page while the device
	changes hands, rendered by the offline route IN PLACE of the game, so the
	previous person's components and their state are not mounted under it.

	Renders `$lib/game/lobby/hotseat`'s state and decides nothing: whose turn it
	is comes from the chain, and the one press is the store's `begin`.
-->
<script lang="ts">
	import {Button} from '$lib/shadcn/ui/button';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import type {HotseatState} from '$lib/game/lobby/hotseat';

	interface Props {
		current: HotseatState;
		onBegin: () => void;
	}

	let {current, onBegin}: Props = $props();
</script>

<div
	class="container mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-4 px-4 py-24 text-center"
	data-testid="handover"
	data-step={current.step}
>
	{#if current.step === 'Passing'}
		<h1 class="text-lg font-semibold" data-testid="handover-to">
			Pass the device to {current.label}
		</h1>
		<p class="max-w-md text-sm text-muted-foreground">
			Nothing of the previous turn is on screen. {current.label}, press when you
			have the device.
		</p>
		<Button data-testid="handover-begin" onclick={onBegin}
			>I am {current.label}: begin</Button
		>
	{:else if current.step === 'Switching'}
		<Spinner class="size-6" />
		<p class="text-sm text-muted-foreground">
			Getting {current.label}'s turn ready&hellip;
		</p>
	{:else if current.step === 'Resolving'}
		<Spinner class="size-6" />
		<h1 class="text-lg font-semibold" data-testid="handover-resolving">
			Everyone here has committed
		</h1>
		<p class="max-w-md text-sm text-muted-foreground">
			The cycle is closing: the world plays its seats, then every turn is
			revealed. The device goes to the first player once it has.
		</p>
	{:else}
		<Spinner class="size-6" />
		<p class="text-sm text-muted-foreground">
			Finding whose turn it is&hellip;
		</p>
	{/if}
</div>

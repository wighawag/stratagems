<!--
	A TABLE'S END (step L4): where it stands, the settlement anyone may send
	once it has ended, the winner once settled, and the withdrawal after.
	Logic-less: what it says is `../table-end.ts`'s `describeTableEnd`.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {derived, readable} from 'svelte/store';
	import {getAppContext} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {describeTableEnd} from '../table-end';
	import {shortAddress} from './panels';

	const {game} = getAppContext();
	const tableEnd = game.tableEnd;
	const model = tableEnd
		? derived(
				[tableEnd, game.activeIdentity, game.reserve],
				([$end, $identity, $reserve]) =>
					describeTableEnd($end, {
						viewer: $identity,
						reserve: ($reserve as {amount?: bigint}).amount,
						label: shortAddress,
					}),
			)
		: readable(undefined);
	const settling = tableEnd?.settling ?? readable({step: 'Idle' as const});
	const withdrawing =
		tableEnd?.withdrawing ?? readable({step: 'Idle' as const});
</script>

{#if tableEnd && $model}
	<div
		class="pointer-events-auto w-72 rounded-lg bg-background/90 p-3 text-sm shadow-lg backdrop-blur"
		data-testid="table-end"
	>
		<p class="font-semibold">The end</p>
		<p class="mt-1 text-xs" data-testid="table-end-status">{$model.status}</p>
		{#if $model.canSettle}
			<Button
				size="sm"
				class="mt-2"
				data-testid="table-settle"
				disabled={$settling.step === 'Sending'}
				onclick={() => void tableEnd.settle()}
				>{$settling.step === 'Sending'
					? 'Settling...'
					: 'Settle the table'}</Button
			>
		{/if}
		{#if $model.canWithdraw}
			<Button
				size="sm"
				variant="outline"
				class="mt-2"
				data-testid="table-withdraw"
				disabled={$withdrawing.step === 'Sending'}
				onclick={() => void tableEnd.withdraw()}
				>{$withdrawing.step === 'Sending'
					? 'Withdrawing...'
					: 'Withdraw your gems'}</Button
			>
		{/if}
		{#if $settling.step === 'Error'}
			<p class="mt-2 text-xs text-red-400">{$settling.message}</p>
		{/if}
		{#if $withdrawing.step === 'Error'}
			<p class="mt-2 text-xs text-red-400">{$withdrawing.message}</p>
		{/if}
	</div>
{/if}

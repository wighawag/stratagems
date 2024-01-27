<script lang="ts">
	import {createTxExecutor} from './txexecutor';

	let className = '';
	export {className as class};

	export let btn = '';

	export let func: (...args: any[]) => Promise<undefined | `0x${string}`>;
	export let args: any[] = [];

	const execution = createTxExecutor(func);

	$: pending =
		$execution.sent &&
		(!$execution.action ||
			$execution.action.inclusion === 'BeingFetched' ||
			$execution.action.inclusion === 'Broadcasted' ||
			$execution.action.inclusion === 'NotFound' ||
			($execution.action.inclusion === 'Included' && !$execution.action.final));
	$: error =
		$execution.error || $execution.action?.inclusion === 'Cancelled' || $execution.action?.status === 'Failure';
	$: disabled = $execution.waitingSigning || pending;
</script>

<div class={className}>
	{#if error}
		{#if $execution.error}
			{$execution.error}
			<button class={`btn ${btn} btn-error m-2`} on:click={() => execution.acknowledgeError()}>Ok</button>
		{:else}
			Error: {$execution.action?.inclusion} : {$execution.action?.status}
			<button class={`btn ${btn} btn-error m-2`} on:click={() => execution.acknowledgeError()}>Ok</button>
		{/if}
	{:else}
		{#if pending}
			{#if $execution.action?.inclusion}
				{#if $execution.action?.inclusion === 'Included'}
					Please wait...
				{:else}
					{$execution.action?.inclusion}
				{/if}
			{/if}
		{/if}
		<button
			class={`btn ${btn} btn-secondary ${disabled ? 'btn-disabled' : ''} m-2`}
			on:click={() => execution.execute(args)}><slot /></button
		>
	{/if}
</div>

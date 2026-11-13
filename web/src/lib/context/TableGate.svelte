<script lang="ts">
	// What a table's page shows while the table is resolved, or instead of it
	// when it cannot be (`./table-gate.ts`). Renders the gate's states only; the
	// layout shows the app once the gate is `Ready`.
	import type {ContextOpening} from './table-gate';

	interface Props {
		opening: Exclude<ContextOpening<unknown>, {step: 'Ready'}>;
		retry: () => void;
		/** Where the game's tables are listed. */
		lobbyHref: string;
	}

	let {opening, retry, lobbyHref}: Props = $props();
</script>

<div
	class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
	data-testid="table-gate"
	data-step={opening.step}
>
	{#if opening.step === 'Opening'}
		<p class="text-lg font-semibold">Opening the table</p>
		<p class="max-w-md font-mono text-xs break-all text-muted-foreground">
			{opening.address}
		</p>
	{:else if opening.step === 'NotATable'}
		<p class="text-lg font-semibold text-destructive">This is not a table</p>
		<p class="max-w-md text-sm text-muted-foreground">{opening.reason}</p>
		<p class="max-w-md font-mono text-xs break-all text-muted-foreground">
			{opening.address}
		</p>
		<a
			class="rounded-md border px-4 py-2 text-sm hover:bg-muted"
			href={lobbyHref}
		>
			See the tables
		</a>
	{:else}
		<p class="text-lg font-semibold text-destructive">
			The table could not be read
		</p>
		<p class="max-w-md text-sm text-muted-foreground">{opening.message}</p>
		<button
			class="rounded-md border px-4 py-2 text-sm hover:bg-muted"
			onclick={retry}
		>
			Try again
		</button>
	{/if}
</div>

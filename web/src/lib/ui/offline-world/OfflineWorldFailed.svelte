<script lang="ts">
	/**
	 * THE CARD AN OFFLINE WORLD SHOWS WHEN ITS BOOT FAILED, with the ways out.
	 *
	 * Which exits to show is `$lib/offline-exits`'s decision, handed in; this
	 * renders it. "Try again" is the retry the error text itself asks for (the
	 * world restores from its persisted chain and boots again). "Leave this
	 * table" is the one DESTRUCTIVE exit, so its sentence says it throws the world
	 * away rather than retrying it: a world that fails every boot would otherwise
	 * be inescapable, because Home keeps the same table.
	 */
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import {Button} from '$lib/shadcn/ui/button';
	import type {OfflineWorldExits} from '$lib/offline-exits';

	let {
		error,
		exits,
		onTryAgain,
		onLeave,
	}: {
		error: string;
		exits: OfflineWorldExits;
		onTryAgain: () => void;
		onLeave: () => void;
	} = $props();
</script>

<div class="container mx-auto max-w-2xl px-4 py-16">
	<div
		class="flex items-start gap-3 rounded-lg border border-destructive/50 p-4"
		data-testid="offline-world-failed"
	>
		<AlertCircleIcon class="mt-0.5 size-5 shrink-0 text-destructive" />
		<div>
			<p class="font-semibold">The offline world did not start.</p>
			<p class="mt-1 text-sm text-muted-foreground">
				{error}
			</p>
			{#if exits.tryAgain || exits.leaveTheTable}
				<div class="mt-4 flex flex-wrap gap-2">
					{#if exits.tryAgain}
						<Button
							size="sm"
							data-testid="try-the-world-again"
							onclick={onTryAgain}>Try again</Button
						>
					{/if}
					{#if exits.leaveTheTable}
						<Button
							size="sm"
							variant="outline"
							data-testid="leave-the-failed-table"
							onclick={onLeave}>Leave this table</Button
						>
					{/if}
				</div>
				{#if exits.leaveTheTable}
					<p class="mt-2 text-xs text-muted-foreground">
						Leaving throws this world away and starts a new one.
					</p>
				{/if}
			{/if}
		</div>
	</div>
</div>

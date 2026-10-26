<!--
	The HUD, drawn over the canvas: the template's (`placement/ui/GameHud.svelte`)
	with stratagems' words, and stratagems' own panels beside it (step 6c): the
	faction picker, the cell panel and land menu, winnings, test gems, the
	leaderboard and the indexer's progress.

	Logic-less on purpose (see AGENTS.md): everything it shows comes from the
	`HudModel` store, and every button calls straight into the game's stores. If
	a decision has to be made about what to show, it belongs in `hud.ts`.
-->
<script lang="ts">
	import {getAppContext} from '$lib';
	import {createHud} from './hud';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import GameClock from '$lib/game/ui/GameClock.svelte';
	import FactionPicker from './FactionPicker.svelte';
	import CellPanel from './CellPanel.svelte';
	import Winnings from './Winnings.svelte';
	import TestGems from './TestGems.svelte';
	import Leaderboard from './Leaderboard.svelte';
	import Syncing from './Syncing.svelte';

	const context = getAppContext();
	const {game} = context;
	const hud = createHud(context);

	const submission = game.submission;
	const planning = game.planning;
	const missedReveal = game.missedReveal;
	// A commitment the chain holds that this browser has no submission for. The
	// planned cells are offered as the candidate and the hash decides; nothing is
	// sent either way. See $lib/game/core/recovery.
	const recovery = game.recovery;
	const plannedActions = game.planning.actions;
	// Getting a stake is ONE transaction that also funds the play key; the rail
	// refuses to run twice at once, including across a reload, which is why the
	// button calls it rather than guarding itself. See $lib/game/acquire.
	const acquisition = game.acquisition;
	// One shared flow, built in the context, so the account panel and a blocked
	// move cannot open two top-ups at once.
	const topUp = context.topUp;

	const toneClass: Record<string, string> = {
		idle: 'text-muted-foreground',
		busy: 'text-blue-400',
		good: 'text-emerald-400',
		bad: 'text-red-400',
	};
</script>

<!-- Stratagems' own panels, on the right so the board's middle stays clear. -->
<div
	class="pointer-events-none absolute top-3 right-3 z-10 flex flex-col items-end gap-2"
>
	<Leaderboard />
	<FactionPicker />
	<Winnings />
	<CellPanel />
</div>

<div
	class="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3"
>
	<!-- Phase and cycle -->
	<div
		class="pointer-events-auto w-fit rounded-lg bg-background/85 p-3 shadow-lg backdrop-blur"
	>
		<!--
			THE DIAL, not a dot and a bar. It is the one thing a player checks
			constantly, and a pie reads faster than a bar because the answer is a
			shape rather than a length. It is offered by the framework
			(`game/ui/GameClock.svelte`) against the four-part model; a game that
			wants a different picture writes one against the same type.
		-->
		<div class="flex items-center gap-3">
			<GameClock
				phase={$hud.phase}
				progress={$hud.progress}
				secondsLeft={$hud.secondsLeft}
				size={72}
			/>
			<div>
				<p class="text-sm font-semibold">{$hud.phaseLabel}</p>
				<p class="text-xs text-muted-foreground">cycle {$hud.cycleNumber}</p>
			</div>
		</div>
		{#if $hud.walletSigningNotice}
			<p class="mt-1 max-w-xs text-xs text-amber-400">
				{$hud.walletSigningNotice}
			</p>
		{/if}
		{#if $hud.planningForNextCycle}
			<p class="mt-1 text-xs text-amber-400">
				This cycle is closed. New picks count for the next one.
			</p>
		{/if}
		<Syncing />
	</div>

	<!-- The submission -->
	<div
		class="pointer-events-auto w-fit max-w-md rounded-lg bg-background/85 p-3 shadow-lg backdrop-blur"
	>
		<!--
			A missed reveal has already cost the player their bond, so it is stated
			plainly and settled only on a deliberate press: acknowledging is what
			makes the forfeit final on chain, and it is not ours to do for them.
		-->
		{#if $hud.missedReveal}
			<div class="mb-3 rounded-md border border-red-500/40 bg-red-500/10 p-2">
				<p class="text-sm font-semibold text-red-400">
					{$hud.missedReveal.headline}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{$hud.missedReveal.detail}
				</p>
				<Button
					size="sm"
					variant="destructive"
					class="mt-2"
					disabled={!$hud.missedReveal.canAcknowledge}
					onclick={() => missedReveal.acknowledge()}
				>
					{$hud.missedReveal.busy
						? 'Acknowledging...'
						: 'Acknowledge missed reveal'}
				</Button>
			</div>
		{/if}

		<!--
			The chain holds a commitment this browser cannot open. Unlike a missed
			reveal, nothing has been lost yet and the whole point is that it still
			can be: the player re-enters the same turn and the hash decides.
		-->
		{#if $hud.recovery}
			<div
				class="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2"
			>
				<p class="text-sm font-semibold text-amber-400">
					{$hud.recovery.headline}
				</p>
				<p class="mt-1 max-w-sm text-xs text-muted-foreground">
					{$hud.recovery.detail}
				</p>
				<Button
					size="sm"
					class="mt-2"
					disabled={!$hud.recovery.canRecover}
					onclick={() => recovery.offer($plannedActions)}
				>
					{$hud.recovery.busy ? 'Checking...' : 'Recover turn'}
				</Button>
			</div>
		{/if}

		{#if $hud.setup}
			<!--
				Not yet playable: ask for the one thing that is missing, rather than
				showing planning controls that cannot lead anywhere.
			-->
			<p class="text-sm font-semibold">{$hud.setup.headline}</p>
			<p class="mt-1 max-w-sm text-xs text-muted-foreground">
				{$hud.setup.detail}
			</p>
			{#if $hud.setup.action === 'stake'}
				<!-- The testid is what an e2e presses. Its LABEL says what this game
				     sells, so a suite matching on the words breaks the moment the
				     stake changes - which is exactly what happened when a branch
				     started selling avatars instead of tokens. -->
				<Button
					size="sm"
					class="mt-3"
					data-testid="acquire-stake"
					disabled={$hud.setup.busy}
					onclick={() => acquisition.buy()}
				>
					{$hud.setup.busyLabel ?? $hud.setup.actionLabel}
				</Button>
				{#if $hud.setup.error}
					<p class="mt-2 max-w-sm text-xs text-red-400">{$hud.setup.error}</p>
				{/if}
				<div class="mt-3"><TestGems /></div>
			{:else if $hud.setup.action === 'authorise'}
				<!--
					The same flow the out-of-gas remedy uses: it registers the delegate
					AND funds it in one transaction, which is the right shape here too.
					A key that is authorised but has no gas is authorised in name only,
					and that is a second dead end one step further on.
				-->
				<Button
					size="sm"
					class="mt-3"
					onclick={() => topUp.start(topUp.purposes.authorise)}
				>
					Authorise and carry on
				</Button>
			{/if}
		{:else}
			<p class="text-sm {toneClass[$hud.submissionTone]}">
				{$hud.submissionLabel}
			</p>

			{#if $hud.outOfGas}
				<!--
					The one failure with a remedy. The submission retries itself once the
					gas arrives, so this offers the top-up and says so, rather than
					asking the player to also remember to press something after.
				-->
				<div
					class="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2"
				>
					<p class="text-xs text-muted-foreground">{$hud.outOfGas.detail}</p>
					<!-- The gas remedy, so the payment is a top-up even though the
					     submission is what is blocked; the sentence above has already
					     said why. -->
					<Button
						size="sm"
						class="mt-2"
						onclick={() => topUp.start(topUp.purposes.topUp)}
						>Top up and carry on</Button
					>
				</div>
			{/if}

			<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
				<dt class="text-muted-foreground">Planned</dt>
				<dd>{$hud.plannedCount} move{$hud.plannedCount === 1 ? '' : 's'}</dd>
				<dt class="text-muted-foreground">Cost</dt>
				<dd>{$hud.costLabel}</dd>
				<dt class="text-muted-foreground">Reserve</dt>
				<dd>{$hud.reserveLabel}</dd>
			</dl>

			{#if $hud.warning}
				<p class="mt-2 text-xs text-amber-400">{$hud.warning}</p>
			{/if}

			<div class="mt-3 flex flex-wrap gap-2">
				<Button
					size="sm"
					disabled={!$hud.canCommit}
					onclick={() => submission.commit()}>Commit now</Button
				>
				{#if $hud.canReveal}
					<Button
						size="sm"
						variant="destructive"
						onclick={() => submission.reveal()}>Retry reveal</Button
					>
				{/if}
				<Button
					size="sm"
					variant="outline"
					disabled={!$hud.canClear}
					onclick={() => planning.clear()}>Clear</Button
				>
				<!-- The same rail as the setup gate, so a top-up is one transaction
				     too and cannot be started twice. It refuses while a previous one is
				     still settling, which is why the label follows the flow. -->
				<Button
					size="sm"
					variant="secondary"
					data-testid="acquire-more-stake"
					disabled={$hud.acquiring !== undefined}
					onclick={() => acquisition.buy()}
				>
					{$hud.acquiring ?? 'Add stake'}
				</Button>
			</div>

			<div class="mt-3"><TestGems /></div>

			<p class="mt-2 text-xs text-muted-foreground">
				Click a cell to place a gem of your colour on it, and again to take the
				move back; click one of your own cells at full life to remove it. A
				living cell of another player is theirs this cycle; two placements on
				one empty cell in the same cycle collide into an Evil cell.
			</p>
		{/if}
	</div>
</div>

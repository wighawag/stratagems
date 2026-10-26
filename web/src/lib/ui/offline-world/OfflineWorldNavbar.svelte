<script lang="ts">
	/**
	 * THE CHROME OF AN OFFLINE WORLD: the bar at the top of a page the world owns.
	 *
	 * It replaces the app's navbar on `/offline` rather than parameterising it,
	 * and that is a decision with a reason (ADR-0004 on the `work` branch,
	 * jolly-roger's ADR-0009 for the mechanism). The app's navbar answers an
	 * online player's questions, and on a page an offline world OWNS two of its
	 * answers have no truthful form: the ACCOUNT is one this world generated, so
	 * showing it where the app shows the player's own says "your account changed"
	 * to anyone who played online first, and "connected" is not true-but-boring
	 * but MEANINGLESS - there is nothing to connect to and nothing a player could
	 * do about it either way. Credits are the same: the world invented the money.
	 *
	 * SO THEY ARE ABSENT, not disabled and not showing a placeholder. A control
	 * reporting a state with one possible value is the same defect as a dialog
	 * with one possible answer, which this repo has removed twice (the lobby's
	 * authorise step, the acquisition rail's three transactions).
	 *
	 * WHAT IT ANSWERS INSTEAD is what an offline player can act on: which world
	 * this is, how many seats are at the table, and the two ways out - back to the
	 * app, and leaving the table. The third thing a player needs to be told, that
	 * this browser holds a key playing for them, is a sentence rather than a
	 * control and lives in the bar below (`OfflineWorldBar.svelte`), because it
	 * does not fit in `var(--navbar-height)` and is not something to act on.
	 *
	 * IT READS APP-SCOPED MODULES, NEVER A CONTEXT, and that is forced rather than
	 * chosen. A declared navbar is rendered by `routes/+layout.svelte`, OUTSIDE
	 * every route subtree, and the world's own context is provided INSIDE the
	 * route (svelte's `setContext` shadows one subtree). So a chrome rendered up
	 * there cannot see the world it would describe - unless the facts live in a
	 * module, which they do and must: `$lib/offline` keeps the world app-scoped
	 * because a world is state and a route-scoped one would be thrown away by the
	 * router, and `$lib/offline-lobby` keeps the lobby app-scoped so it does not
	 * forget a choice mid-decision. This file is why that was the right shape and
	 * not merely a convenient one.
	 *
	 * IT MUST NOT CALL `getAppContext()`. Up there that returns the APP's context,
	 * which is the very thing whose claims this exists to stop repeating.
	 *
	 * SELF-GATING, like a bar. Before the world is up there is nothing true to say
	 * about it, so it says the two things that are (where you are, and the way
	 * back) and nothing else. The route is showing a lobby or a spinner then, and
	 * both say what they are.
	 */
	import {route} from '$lib';
	import {offlineWorld} from '$lib/offline';
	import {offlineLobby} from '$lib/offline-lobby';
</script>

<!--
	`data-app-navbar` IS THE CONTRACT AND NOT DECORATION. A replacement navbar is
	still a navbar: `AppShell` reserves `var(--navbar-height)` for whatever sits in
	this slot, and `e2e/tests/layout-shell.e2e.ts` measures this attribute to hold
	that the page sits BELOW the chrome rather than under it. That is not a
	hypothetical here - this template shipped the other outcome once, with the
	board pinned to the viewport and the navbar covering the phase countdown, which
	is the one thing a player must see.

	The positioning is the app navbar's, deliberately unchanged: `fixed`, because a
	sticky bar's travel runs out inside a `100dvh` shell, and the same
	`--navbar-height` the shell reserves so there is one number rather than two.
	`needs-gutter-padding` for the same touch-device reason (app.css).
-->
<nav
	data-app-navbar
	data-testid="offline-world-navbar"
	class="needs-gutter-padding fixed top-0 left-0 z-50 flex h-[var(--navbar-height)] w-full items-center justify-between bg-background py-4 shadow-md"
>
	<div class="m-1 flex h-full items-center gap-3 px-2">
		<!-- THE WAY BACK TO THE APP, in the position the app's own Home link
		     occupies, so it is where a player already looked. Leaving the table (on
		     the right) is a different exit: it throws this world away. -->
		<a
			href={route('/')}
			class="rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
		>
			Home
		</a>
		<span class="text-sm font-semibold">Playing offline</span>
		{#if $offlineWorld.step === 'Ready'}
			<!-- WHICH WORLD THIS IS. The chain id is the only name it has, and it is
			     the thing that distinguishes this world from the one a player would
			     get by leaving the table. -->
			<span class="hidden text-xs text-muted-foreground sm:inline"
				>world <code>{$offlineWorld.world.chainId}</code></span
			>
		{/if}
	</div>

	{#if $offlineWorld.step === 'Ready'}
		<div class="m-1 flex h-full items-center gap-3 px-2">
			<!-- HOW MANY ARE AT THE TABLE, which is what the cycle waits for. Its own
			     element so a test can match this sentence and nothing larger. -->
			<span class="text-xs text-muted-foreground"
				>{$offlineLobby.seats} seats at this table</span
			>
			<button
				class="rounded px-2 py-1 text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
				data-testid="leave-the-table"
				onclick={() => offlineLobby.leaveTheTable()}>Leave this table</button
			>
		</div>
	{/if}
</nav>

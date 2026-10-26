<!--
	PLAY OFFLINE: the same game, against a chain inside this tab.

	THE ROUTE IS THE CHOOSING AND NOTHING ELSE. Booting a chain, running this
	game's own deploy scripts on it, declaring the manual cycle policy and
	handing the player their stake all live in `$lib/offline`, which is in turn
	composition over `$lib/embedded`. Nothing world-building belongs in a route:
	a descendant of this template deletes the routes it inherits, and would throw
	it away.

	THE GAME COMPONENT IS IMPORTED RATHER THAN COPIED, and that is the whole
	claim a world makes: the same page, against a different chain, without
	knowing there is more than one. A second copy would prove nothing - and
	`routes/play/+page.svelte` must stay byte-identical across every branch of
	this template, so it could not have been edited to know about this anyway.

	THE LOBBY IS THE SAME STORY ONE STEP EARLIER. How many seats are at the
	table is a decision, and it has to be taken before the world boots, because
	what enrols a player is being given this game's stake while the world is
	being built. All of that reasoning is `$lib/game/lobby`'s, wired to this world
	by `$lib/offline-lobby`, and none of it is here: this file renders a number, a set of choices and two presses. It
	knows nothing about what a seat HOLDS, which is what keeps it one git object
	across every branch of this template.

	AND SO IS THE CHROME, which is what `+page.ts` beside this file declares. The
	strip that used to be the first element below carried this world's facts and an
	apology for the navbar above it; both are now the CHROME of this surface
	(`$lib/offline-chrome`), rendered by the layout in the slots the app's navbar
	and bars occupy everywhere else. Two things follow, and the second is the point.
	The apology is gone because it is no longer true: what is above this page is
	this world's own bar, not the app's. And the board below is now the whole
	content region, because a bar is chrome and the shell shrinks the region by
	exactly its height - where a strip inside the region was a second thing
	computing the same pixels.
-->
<script lang="ts">
	import {onMount} from 'svelte';
	import DefaultHead from '../../lib/metadata/DefaultHead.svelte';
	import Context from '$lib/context/Context.svelte';
	import {Spinner} from '$lib/shadcn/ui/spinner';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import {offlineWorld} from '$lib/offline';
	import {SEAT_CHOICES} from '$lib/game/lobby/seats';
	import {
		THE_KEY_THIS_BROWSER_PLAYS_WITH,
		offlineLobby,
	} from '$lib/offline-lobby';
	import {Button} from '$lib/shadcn/ui/button';
	import InWorld from '$lib/context/InWorld.svelte';
	import Play from '../play/+page.svelte';

	onMount(() => {
		offlineLobby.enter();
	});
</script>

<DefaultHead title={'Play Offline - a chain in this tab'} />

{#if $offlineWorld.step === 'Ready'}
	<!-- A NESTED PROVIDER, which is the whole mechanism in one element.
	     `setAppContext` is svelte's `setContext`, so this shadows the app's context
	     for THIS SUBTREE only: the game below runs against the chain in the tab,
	     while the app's own context goes on describing the remote chain everywhere
	     else.

	     THE CHROME USED TO BE A KNOWN GAP AND IS NOW A DECLARED CHOICE. It is
	     rendered by `+layout.svelte`, outside every route subtree, so it cannot see
	     the context provided here - which is why this surface supplies its own
	     instead of asking the app's to describe a world it cannot reach. What goes
	     up there, and why an account, a connection state and a credits figure are
	     ABSENT rather than blank, is `$lib/offline-chrome`; the mechanism and the
	     test that decides which case a surface is in are jolly-roger's
	     `$lib/ui/chrome` and its ADR-0009.

	     NO CONNECTION FLOW, AND THAT IS THE POINT RATHER THAN AN OMISSION. A
	     flow exists to relay a wallet's questions - which wallet, which account,
	     approve this - and a wallet this world GENERATED has none: one wallet,
	     one account, and it signs without asking. Mounting one produces modals
	     that flash past describing decisions nobody is making. The rule the two
	     states give between them: a nested world using the PLAYER's wallet needs
	     its own flow, and one that brings its own must not have it. -->
	<!-- THE WHOLE REGION IS THE GAME. This world's own bar took the strip's place
	     and is CHROME now, so there is nothing to subtract here: the shell's content
	     region is already the viewport minus this world's navbar and bar, and `Play`
	     asks for `h-full` and means it, exactly as it does online. That is what
	     ADR-0007 (jolly-roger) exists for, and the reason this route spells no
	     height of its own. -->
	<Context context={$offlineWorld.context}>
		<Play />
		<!-- The app's own overlays, bound to THIS world. Without them the flows this
		     game opens (authorising the browser's key, topping it up) drive stores
		     nothing on screen is reading, and the button appears to do nothing. See
		     the file for what is deliberately not in it. -->
		<InWorld />
	</Context>
{:else if $offlineLobby.step === 'Choosing'}
	<!-- THE CHOICE, AND IT IS THE ONLY ONE. A seat has an occupant, and today an
	     occupant is you or the world; how many there are is the whole of what a
	     player decides here. Which is why this renders a count and a table and
	     asks the lobby for both. -->
	<div class="container mx-auto max-w-2xl px-4 py-24 text-center">
		<h1 class="text-lg font-semibold">How many at the table?</h1>
		<p class="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
			A chain will be created in this browser and this game's own deploy scripts
			run against it. Every seat is given a stake, which is what makes the cycle
			wait for them. Nothing leaves the tab.
		</p>
		<div class="mt-6 flex flex-wrap justify-center gap-2">
			{#each SEAT_CHOICES as choice (choice)}
				<Button
					size="sm"
					variant={choice === $offlineLobby.seats ? 'default' : 'outline'}
					data-testid={`seats-${choice}`}
					onclick={() => offlineLobby.chooseSeats(choice)}>{choice}</Button
				>
			{/each}
		</div>
		<ul
			class="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-2 text-xs text-muted-foreground"
		>
			{#each $offlineLobby.table as seat, index (index)}
				<li class="rounded-md border border-muted-foreground/30 px-2 py-1">
					{seat.occupant.kind === 'you' ? 'You' : 'The world'}
				</li>
			{/each}
		</ul>
		<Button
			class="mt-6"
			data-testid="sit-down"
			onclick={() => offlineLobby.sitDown($offlineLobby.seats)}
			>Sit down and play</Button
		>
		<p class="mx-auto mt-4 max-w-md text-xs text-muted-foreground">
			{THE_KEY_THIS_BROWSER_PLAYS_WITH}
		</p>
	</div>
{:else if $offlineWorld.step === 'Failed'}
	<div class="container mx-auto max-w-2xl px-4 py-16">
		<div
			class="flex items-start gap-3 rounded-lg border border-destructive/50 p-4"
		>
			<AlertCircleIcon class="mt-0.5 size-5 shrink-0 text-destructive" />
			<div>
				<p class="font-semibold">The offline world did not start.</p>
				<p class="mt-1 text-sm text-muted-foreground">
					{$offlineWorld.error}
				</p>
			</div>
		</div>
	</div>
{:else}
	<div
		class="container mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-24 text-center"
	>
		<Spinner class="size-6" />
		<p class="text-sm text-muted-foreground">
			{$offlineWorld.step === 'Booting'
				? $offlineWorld.what
				: 'starting a chain in this tab'}&hellip;
		</p>
		<p class="max-w-md text-xs text-muted-foreground">
			A chain is being created in this browser and this game's own deploy
			scripts are being run against it. Nothing leaves the tab.
		</p>
	</div>
{/if}

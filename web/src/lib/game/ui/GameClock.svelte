<!--
	The phase dial: one offered way to draw `CyclePhase`.

	The thing a player looks at constantly, and a pie reads faster than a bar.
	PROPS ONLY, deliberately: no context, no stores, no game concepts, so it can
	sit anywhere and be tested without an app. Everything it would otherwise have
	to decide belongs in the HUD model that feeds it.

	A game that wants a different dial writes one against `CyclePhase` and drops
	this; the framework's claim is over the four-part MODEL
	(`game/core/cycle-phase.ts`), not over the picture.

	TWO OVERALL STATES, as it always was - green while the cycle is yours to
	change, red once it is resolving - plus ONE transient colour: the catch-up
	flashes blue for the moment between the cycle changing and the fetch for it
	landing. That one earns a colour of its own because it is the only part
	that is neither play nor wait but a REFRESH, and because it is short
	enough that a flash reads truer than a colour that lingers. WHICH of the
	red parts it is shows in the label beside the dial and in its countdown,
	not in a third shade of red: a player acts on "can I move?", and only a
	debugger wants the finer split.

	`#game-clock` is a stable id so that a tour or a test can point at it.
-->
<script lang="ts">
	import type {CyclePhase} from '$lib/game/core/cycle-phase';

	let {
		phase,
		progress,
		secondsLeft,
		size = 100,
	}: {
		phase: CyclePhase;
		/** How far through this part of the cycle, 0..1. */
		progress: number;
		/**
		 * Seconds left, counting the whole wait as one span that ends when the
		 * window opens - the answer to the only question the wait raises.
		 */
		secondsLeft: number;
		size?: number;
	} = $props();

	const phaseLabel = $derived(
		phase === 'play'
			? 'Move window'
			: phase === 'commit'
				? 'Committing'
				: phase === 'reveal'
					? 'Revealing'
					: 'Catching up',
	);

	const center = $derived(size / 2);
	const radius = $derived(size * 0.4);

	// Green while the window is open, red for the lock and the reveal, blue for
	// the refresh at the boundary.
	const colour = $derived(
		phase === 'play'
			? 'oklch(57.7% 0.245 27.325)'
			: phase === 'catching-up'
				? 'oklch(62% 0.15 250)'
				: 'oklch(85.2% 0.199 91.936)',
	);
	const background = $derived(
		phase === 'play'
			? 'oklch(79.2% 0.209 151.711)'
			: phase === 'catching-up'
				? 'oklch(40% 0.12 250)'
				: 'oklch(57.7% 0.245 27.325)',
	);

	function piePath(fraction: number): string {
		const angle = Math.min(1, Math.max(0, fraction)) * 360;
		if (angle === 0) return '';
		const point = (degrees: number) => [
			center + radius * Math.cos(((degrees - 90) * Math.PI) / 180),
			center + radius * Math.sin(((degrees - 90) * Math.PI) / 180),
		];
		const [startX, startY] = point(0);
		const [endX, endY] = point(angle >= 360 ? 359.999 : angle);
		const largeArc = angle > 180 ? 1 : 0;
		return `M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
	}

	const path = $derived(piePath(progress));
</script>

<div
	id="game-clock"
	class="relative inline-block"
	style="width: {size}px; height: {size}px"
	role="timer"
	aria-label="{phaseLabel}, {secondsLeft === undefined
		? 'unknown time left'
		: `${secondsLeft} seconds left`}"
>
	<svg width={size} height={size} viewBox="0 0 {size} {size}">
		<circle cx={center} cy={center} r={radius} fill={background} />
		{#if path}
			<path d={path} fill={colour} class="drop-shadow" />
		{/if}
		<text
			x={center}
			y={center}
			text-anchor="middle"
			dominant-baseline="central"
			class="fill-white font-mono text-[1.5rem] font-bold"
			style="paint-order: stroke; stroke: rgba(0,0,0,0.6); stroke-width: 4px"
		>
			{secondsLeft}
		</text>
	</svg>
</div>

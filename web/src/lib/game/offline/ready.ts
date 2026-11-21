import type {Readable} from 'svelte/store';
import {pokeWhenTheHumanActs} from '$lib/game/core/played';

type Startable = {start(): () => void};

/**
 * WHAT A WORLD PLAYS WITH, STARTED WITH THE BOARD AND STOPPED WITH IT: the
 * context's own `start`, the seats the world plays, the poke that hands them
 * the human's commit or reveal at once (rather than at their next poll), the
 * local revealer and the handover when several people share the device, and
 * any start of the game's own (`also`, after the rest). Stopped the other way
 * round, the seats' sandbox (`decider`) let go before the context.
 *
 * Wrapped around the context's own `start` rather than started at boot, so
 * that their lifetime is exactly the human's advance client's: both spend the
 * world's gas to keep a cycle turning, and neither has any business doing so
 * while nothing is on screen. The WORLD still outlives the page (the chain is
 * not disposed when a router navigates away); what stops is the playing.
 *
 * Answers what the world's `Ready` carries as its `context`.
 */
export function readyToPlay<
	C extends {game: {submission: Readable<{step: string}>}},
>(params: {
	context: {context: C; start: () => () => void};
	players: Startable & {tick(): Promise<void>};
	revealer?: Startable;
	hotseat?: Startable;
	/** How the world's seats decide, when one plays above `random`: its sandbox stops with the board. */
	decider?: {sandbox: {dispose(): void}};
	also?: readonly (() => () => void)[];
}): {context: C; start: () => () => void} {
	const {context, players, revealer, hotseat, decider} = params;
	return {
		context: context.context,
		start: () => {
			const stopContext = context.start();
			const stopPlayers = players.start();
			const stopPoke = pokeWhenTheHumanActs({
				loop: players,
				submission: context.context.game.submission,
			});
			const stopRevealer = revealer?.start() ?? (() => {});
			const stopHotseat = hotseat?.start() ?? (() => {});
			const stopAlso = (params.also ?? []).map((start) => start());
			return () => {
				for (const stop of [...stopAlso].reverse()) stop();
				stopHotseat();
				stopRevealer();
				stopPoke();
				stopPlayers();
				// The seats' sandbox stops with the board; a later decision starts
				// it again.
				decider?.sandbox.dispose();
				stopContext();
			};
		},
	};
}

/**
 * Dev/debug: the world on the console (`offlineWorld`), beside the `context`
 * handle `core.ts` installs. Worth having for a world specifically, because the
 * only way to look at a chain in a tab is to hold it: there is no RPC url to
 * curl, no explorer, and no second process that can see it.
 */
export function holdTheWorldOnTheConsole(handle: object): void {
	if (typeof window === 'undefined') return;
	try {
		(globalThis as unknown as Record<string, unknown>).offlineWorld = handle;
	} catch {
		// A console convenience is never worth failing a boot for.
	}
}

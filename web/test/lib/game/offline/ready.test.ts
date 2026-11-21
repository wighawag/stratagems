import {describe, it, expect} from 'vitest';
import {writable} from 'svelte/store';
import {readyToPlay} from '$lib/game/offline';

/**
 * WHAT AN OFFLINE WORLD STARTS WITH ITS BOARD AND STOPS WITH IT (K2b): the
 * context, the played seats, the poke that hands them the human's move at
 * once, the local revealer and the handover, then a game's own starts; stopped
 * the other way round, the seats' sandbox let go before the context. Node only,
 * every part a fake that records when it starts and stops.
 */

function recorder() {
	const log: string[] = [];
	const part = (name: string) => ({
		start: () => {
			log.push(`start ${name}`);
			return () => log.push(`stop ${name}`);
		},
	});
	return {log, part};
}

function parts() {
	const {log, part} = recorder();
	const submission = writable<{step: string}>({step: 'Idle'});
	const ticks: number[] = [];
	const players = {
		...part('players'),
		tick: async () => {
			ticks.push(1);
		},
	};
	const context = {
		context: {game: {submission}},
		...part('context'),
	};
	return {log, part, submission, ticks, players, context};
}

describe('readyToPlay', () => {
	it('starts the context, the seats, the poke, the revealer, the handover and the game’s own, and stops them in reverse', () => {
		const {log, part, players, context} = parts();
		const ready = readyToPlay({
			context: context as never,
			players,
			revealer: part('revealer'),
			hotseat: part('hotseat'),
			decider: {sandbox: {dispose: () => log.push('dispose sandbox')}},
			also: [part('settler').start],
		});
		expect(ready.context).toBe(context.context);
		const stop = ready.start();
		expect(log).toEqual([
			'start context',
			'start players',
			'start revealer',
			'start hotseat',
			'start settler',
		]);
		log.length = 0;
		stop();
		expect(log).toEqual([
			'stop settler',
			'stop hotseat',
			'stop revealer',
			'stop players',
			'dispose sandbox',
			'stop context',
		]);
	});

	it('pokes the played seats when the human commits or reveals, until stopped', () => {
		const {players, context, submission, ticks} = parts();
		const stop = readyToPlay({context: context as never, players}).start();
		submission.set({step: 'Committing'});
		expect(ticks).toHaveLength(0);
		submission.set({step: 'Committed'});
		submission.set({step: 'Revealed'});
		expect(ticks).toHaveLength(2);
		stop();
		submission.set({step: 'Committed'});
		expect(ticks).toHaveLength(2);
	});

	it('needs no revealer, handover, sandbox or start of the game’s own', () => {
		const {log, players, context} = parts();
		const stop = readyToPlay({context: context as never, players}).start();
		stop();
		expect(log).toEqual([
			'start context',
			'start players',
			'stop players',
			'stop context',
		]);
	});
});

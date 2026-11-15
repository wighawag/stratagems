import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';

/**
 * A GAME WITH ONLINE TABLES OFFERS THEM OFFLINE TOO (stratagems' plan, step
 * OT1, OT1-1): an invariant, held here as the framework boundary is held by
 * `framework-boundary.test.ts`.
 *
 * A game has online tables when its `$app-specific` module exports a `lobby`
 * (`$lib/context/index` reads it); it offers them offline when its
 * `$lib/offline` exports `startOfflineTable` beside `startOfflineWorld`, which
 * is the one half of an offline table only the game can write: how a seat is
 * staked at a table. The lobby offers the table whenever both are there
 * (`$lib/offline-lobby`), so nothing else is asked of a game.
 *
 * WHY A TEST AND NOT A REQUIRED EXPORT: a required export would fail to compile
 * at the cascade in every game whose offline tables are not written yet, and an
 * opt-in nothing checks is one a game may never take. A test fails the one
 * repo that is short, says what is missing, and lets the gaps below be a
 * schedule rather than a broken build.
 *
 * Read by DYNAMIC IMPORT, as the lobby reads them, rather than by grepping the
 * source: an export is what the module answers, however it is spelled.
 */

/**
 * THE GAMES WHOSE OFFLINE TABLES ARE STILL TO BE WRITTEN, by the root
 * `package.json`'s `name`, each with the step that closes its gap. EVIDENCE, in
 * the sense of the tree's rule: a schedule measured when the invariant landed,
 * not an instruction. Until a gap closes its game is offered the world only.
 * An entry whose game now offers tables offline fails below: delete it, here
 * at the template, so the deletion cascades.
 */
const KNOWN_GAPS: Record<string, string> = {
	stratagems: "stratagems' plan, step OT2",
	'reveal-or-die-monorepo': "stratagems' plan, step OT3",
	'bomber-world-monorepo':
		"stratagems' plan, step OT3 (reveal-or-die's tables, by cascade)",
};

const root = new URL('../..', import.meta.url).pathname;
const repo = (
	JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as {name: string}
).name;

describe('a game with online tables offers them offline', () => {
	it(
		'exports startOfflineTable from its world when its $app-specific module exports a lobby',
		{timeout: 30_000},
		async () => {
			const app = (await import('$app-specific')) as Record<string, unknown>;
			const offline = (await import('$lib/offline')) as Record<string, unknown>;
			const hasTables = 'lobby' in app && app.lobby !== undefined;
			const offersThem = typeof offline.startOfflineTable === 'function';

			if (repo in KNOWN_GAPS) {
				// A gap that closed is invisible unless something says so.
				expect(
					offersThem,
					`${repo} now offers its tables offline: delete its KNOWN_GAPS entry`,
				).toBe(false);
				return;
			}
			if (hasTables) {
				expect(
					offersThem,
					`${repo} has online tables (its $app-specific module exports a lobby) and its $lib/offline exports no startOfflineTable({table, cycles, gameOptions})`,
				).toBe(true);
			}
		},
	);
});

import {createLobby, type LobbyStore} from '$lib/game/lobby/lobby';
import {CHAIN_ID_STORAGE_KEY, startOfflineWorld} from '$lib/offline';

/**
 * THE OFFLINE WORLD'S LOBBY: the framework's lobby, wired to this world.
 *
 * WHAT IS LEFT HERE IS THE WIRING AND THE WORDS, and that split is the point.
 * How many seats there may be, what a seat is, when the question may be asked
 * and why it cannot be asked again are `$lib/game/lobby/*`'s, because they are
 * true of any game whose membership is settled before it boots. What is THIS
 * world's is the two ends the framework cannot know: which world to start, and
 * where this browser remembers it.
 *
 * IT IS A MODULE RATHER THAN THE ROUTE'S WIRING, and that is forced rather than
 * chosen. A lobby is app-scoped, like the world it starts, so it has to be built
 * exactly once: built inside `+page.svelte` it would be rebuilt on every mount
 * and would forget the choice a player was in the middle of making, which is the
 * failure the framework's `Opening` state exists to describe.
 */

/**
 * How many seats the world in this browser was built with.
 *
 * IN THE SAME NAMESPACE AS EVERYTHING ELSE THIS WORLD KEEPS, which is why the
 * framework takes it as a parameter rather than declaring one: it belongs beside
 * `offline-world:chain-id`, and it is a WIRE in `AGENTS.md`'s sense. Renaming it
 * sends a browser that already holds a world back through the chooser, and a
 * different count chosen there would enrol members into a world that is already
 * provisioned.
 */
const SEATS_STORAGE_KEY = 'offline-world:seats';

export const offlineLobby: LobbyStore = createLobby({
	// Both halves of "is there a world here" are this file's to answer, because
	// the chain id is what the world keys everything by. See `$lib/offline`,
	// which is what writes it.
	gameAlreadyHere: () =>
		typeof localStorage !== 'undefined' &&
		localStorage.getItem(CHAIN_ID_STORAGE_KEY) !== null,
	startGame: (table) => void startOfflineWorld({table}),
	// FORGETTING THE CHAIN ID IS WHAT MAKES IT A NEW WORLD: everything the player
	// kept is keyed by that id, so the next boot mints one and builds a world
	// beside the old one rather than into it. The old chain and its deployment
	// records stay in IndexedDB, orphaned, which is exactly what an incoherent
	// restore already does to them and is the honest outcome: they describe a
	// world nothing points at any more.
	forgetGame: () => {
		if (typeof localStorage !== 'undefined') {
			localStorage.removeItem(CHAIN_ID_STORAGE_KEY);
		}
	},
	seatsStorageKey: SEATS_STORAGE_KEY,
});

/**
 * WHAT THE WORLD DOES FOR THE PLAYER THAT AN ONLINE GAME WOULD HAVE ASKED FOR.
 *
 * Said out loud rather than done invisibly, and this is the whole reason the
 * sentence exists. Offline, registering this browser's key is a question with
 * one answer, so the world answers it (`$lib/game/acquire/authorise`). Online it
 * is a real transaction the player signs and pays for, and it is the step that
 * makes every later move promptless. A player who met it for the first time on a
 * real chain, having never been told it exists, would meet it as an unexplained
 * demand at the worst possible moment - in front of a board they had already
 * decided to play.
 *
 * WORDED SO THAT IT IS TRUE IN BOTH PLACES IT IS SHOWN, which took a second
 * draft. The first said the world HAD registered a key, which is a fact in the
 * strip above a running world and a falsehood in the lobby, where no world
 * exists yet - and the lobby is where a player most wants to know what sitting
 * down is about to do. One sentence describing what an offline world does is
 * true in both, and is one string rather than two to keep in step.
 *
 * IT STAYS IN THE APP, beside the world it describes, because `offline` is the
 * EXPERIENCE a player chose rather than a thing the framework has: a lobby in
 * the framework cannot promise what this sentence promises, and a game whose
 * lobby is online would need a different sentence or none.
 */
export const THE_KEY_THIS_BROWSER_PLAYS_WITH =
	'Playing needs a key this browser holds, registered to your account and ' +
	'funded with gas, so your moves cost no prompts. An offline world does ' +
	'that for you. Online it is one transaction you sign and pay for, once.';

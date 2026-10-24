import {get, writable, type Readable} from 'svelte/store';
import {SEATS_BY_DEFAULT, clampSeats, tableOf, type Table} from './seats';

/**
 * THE LOBBY: how many seats are at the table, decided before the game exists.
 *
 * WHY IT HAS TO BE BEFORE. Membership is baked in by SETTING THE GAME UP - what
 * enrols a player is being given whatever this game puts at stake, and that is
 * handed out once, while the game is being built. So the seat count is not a
 * setting a live game could take: changing it would mean staking for somebody
 * or withdrawing somebody mid-cycle, which under the manual policy means
 * changing the denominator unanimity is measured against while a cycle is open.
 * The lobby therefore runs first, and changing the count starts a NEW game.
 *
 * WHICH IS WHY A GAME THAT EXISTS IS NOT SILENTLY REUSED AT A NEW COUNT. A
 * booted game keeps the membership it was provisioned with, and this says so: a
 * browser that already has one goes straight back into it at the count it was
 * built with, and the only way to a different count is to leave the table,
 * which is an explicit press that throws that game away.
 *
 * AND IT IS NOT A GATE ON THE WAY BACK IN. The choice is made once, on a first
 * visit; a reload restores the game and boots straight into it, because asking
 * a returning player the question they already answered is exactly the kind of
 * dialog-with-one-answer this slice removed from the board.
 *
 * WHAT IS DELIBERATELY NOT HERE IS HOTSEAT. A seat whose occupant is a second
 * human is several ACCOUNTS against one game, in a context built for exactly
 * one, and it reopens the account-picker question the embedded wallet closed on
 * purpose. What this owes hotseat is the seat model (`./seats`) and nothing else
 * - and the test of that model is that adding an occupant would not change a
 * line of this file.
 *
 * ## THE GAME IS A PARAMETER, and that inversion is the one structural change
 * ## in the move that brought this file here
 *
 * This used to live in the app namespace and import two things from
 * `$lib/offline`, the reference game's own world builder: the key its chain id
 * is remembered under, and the function that starts a world. It was
 * byte-identical in two different games ONLY because both of them happened to
 * name that file `$lib/offline.ts` and to export the same two names - so a
 * NAMING COINCIDENCE was load-bearing, and a game that called its builder
 * anything else would have had to fork this file to say so.
 *
 * So the dependency is inverted on purpose: a lobby is handed "is there already
 * a game in this browser", "set a game up around this table" and "forget the
 * game this browser holds", and the game wires them. Nothing here knows what a
 * game is, what it is called, how it persists or what it stakes.
 *
 * IT TAKES THE SEATS KEY RATHER THAN DECLARING ONE, for a reason that is about
 * a stake rather than about tidiness. The record belongs in the same namespace
 * as everything else that game keeps in this browser, and a persisted key is a
 * WIRE (see `AGENTS.md`): renaming one silently sends a browser that holds a
 * game back through the chooser, and choosing a different count there would
 * enrol members into a game that is already provisioned. Letting the framework
 * pick the name would mean a rename here could do that to every game at once.
 */

export type LobbyState = {
	/**
	 * `Opening` is BEFORE THE BROWSER HAS LOOKED, and it is load-bearing rather
	 * than a tidy initial value. This app prerenders (ADR-0002), and whether
	 * there is already a game here is a question only the browser can answer -
	 * so the server cannot know which of the other two states is right. A
	 * chooser rendered in prerendered HTML would be on screen before any handler
	 * was attached, and a press against it would be swallowed and then
	 * overwritten the moment {@link LobbyStore.enter} ran. That is measured
	 * rather than feared: a run that chose eight seats got three, silently,
	 * because the click landed before hydration.
	 *
	 * `Choosing` is the only state with a decision left in it. `Sat` means the
	 * table is settled and the game is building or built; the route shows the
	 * game from then on.
	 */
	step: 'Opening' | 'Choosing' | 'Sat';
	/** How many seats, which is the one number the player picks. */
	seats: number;
	/** Who is in each of them. See `./seats`. */
	table: Table;
};

/**
 * What a lobby needs of the game it is the lobby FOR.
 *
 * Four members, and none of them says anything about what a game is. See the
 * inversion note on this module for why they are parameters at all.
 */
export type LobbyDeps = {
	/**
	 * Whether this browser already holds a game.
	 *
	 * Asked rather than remembered here, because the record that answers it is
	 * the game's: it is whatever the game keys its own persistence by, and only
	 * the game knows whether that is one key or several.
	 */
	gameAlreadyHere(): boolean;
	/**
	 * Set a game up around this table, once the seats are taken.
	 *
	 * Fire and forget, deliberately: a lobby has nothing to do with a boot that
	 * is still going, and what a booting game looks like on screen is its own
	 * store to report. Anything this returned would be a second source of truth
	 * for the same question.
	 */
	startGame(table: Table): void;
	/**
	 * Forget the game this browser holds, so that the next visit builds a new
	 * one beside it rather than back into it.
	 *
	 * WHAT MAKES IT A NEW GAME IS THE GAME'S OWN BUSINESS. Here that is
	 * forgetting a chain id, because everything the player keeps is keyed by it;
	 * a different game might have nothing to forget at all. Either way this is
	 * the step that must happen before a different table can be chosen.
	 */
	forgetGame(): void;
	/**
	 * Where to remember how many seats the game in this browser was built with.
	 *
	 * ITS OWN RECORD rather than something read back off the chain, and the
	 * reason is ordering: the count is needed to BUILD the game (setting it up
	 * stakes for each seat), so a game that had to be booted before it could be
	 * counted could not be booted at all. The chain is still the authority on
	 * who is actually enrolled; this is only what the next boot should ask for.
	 *
	 * Note it is deliberately NOT keyed by whatever else a game keys its records
	 * by: a restore that turns out to be incoherent may start a new game
	 * underneath, and the seats the player asked for survive that.
	 */
	seatsStorageKey: string;
};

export type LobbyStore = Readable<LobbyState> & {
	/**
	 * Open the lobby, which is the only thing a route does on mount.
	 *
	 * Boots straight into the game already here, or offers the choice.
	 *
	 * ONCE, AND ONLY OUT OF `Opening`. A lobby is app-scoped, like the game it
	 * starts, so a player who navigates away and comes back mounts the route
	 * again - and a second pass that reset the state would throw away a choice
	 * they were in the middle of making, or re-offer one they had already made.
	 */
	enter(): void;
	/** Pick a different number of seats, before sitting down at them. */
	chooseSeats(seats: number): void;
	/**
	 * Take the table, and build the game around it.
	 *
	 * The count is recorded BEFORE the boot rather than after it, so a boot
	 * interrupted half way (a closed tab, a failed deploy) is still remembered
	 * as the table that game was being built for. The alternative loses the
	 * answer precisely when the game is in the state hardest to reason about.
	 */
	sitDown(seats?: number): void;
	/**
	 * Leave this table, so that the next visit chooses a new one.
	 *
	 * AND IT RELOADS THE PAGE, which looks blunt and is the truthful shape. A
	 * game like this is APP-SCOPED STATE built once: a chain, a wallet, a
	 * context constructed around a deployment address, and players spending its
	 * gas. Tearing all of that down inside a live page to build a second one
	 * would be a whole second lifecycle, existing only for a button nobody
	 * presses twice. A new game is a new page.
	 */
	leaveTheTable(): void;
};

/**
 * One lobby.
 *
 * APP-SCOPED, so a game composes exactly one of these and exports it: a lobby
 * built per route mount would forget the choice on every navigation, which is
 * the bug the `Opening` state exists to describe.
 */
export function createLobby(deps: LobbyDeps): LobbyStore {
	const lobby = writable<LobbyState>(seated('Opening', SEATS_BY_DEFAULT));

	/**
	 * Whether there is a table to go back to, and how big it was.
	 *
	 * BOTH OR NEITHER. A seat record with no game behind it is not a game to
	 * carry on with, so it is ignored rather than acted on: the alternative boots
	 * a brand new game at a remembered count without ever asking, which is the
	 * silent reuse this file exists to avoid.
	 */
	function tableAlreadyHere(): number | undefined {
		if (typeof localStorage === 'undefined') return undefined;
		if (!deps.gameAlreadyHere()) return undefined;
		const seats = localStorage.getItem(deps.seatsStorageKey);
		if (seats === null) return undefined;
		return clampSeats(seats);
	}

	function sitDown(seats: number = SEATS_BY_DEFAULT): void {
		const state = seated('Sat', seats);
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(deps.seatsStorageKey, String(state.seats));
		}
		lobby.set(state);
		deps.startGame(state.table);
	}

	return {
		subscribe: lobby.subscribe,
		enter(): void {
			if (get(lobby).step !== 'Opening') return;
			const already = tableAlreadyHere();
			if (already === undefined) {
				lobby.set(seated('Choosing', SEATS_BY_DEFAULT));
				return;
			}
			sitDown(already);
		},
		chooseSeats(seats: number): void {
			lobby.set(seated('Choosing', seats));
		},
		sitDown,
		leaveTheTable(): void {
			deps.forgetGame();
			if (typeof localStorage !== 'undefined') {
				localStorage.removeItem(deps.seatsStorageKey);
			}
			if (typeof location !== 'undefined') location.reload();
		},
	};
}

function seated(step: LobbyState['step'], seats: number): LobbyState {
	const count = clampSeats(seats);
	return {step, seats: count, table: tableOf(count)};
}

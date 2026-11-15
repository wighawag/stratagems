import {get, writable, type Readable} from 'svelte/store';
import {
	SEATS_BY_DEFAULT,
	WORLD_SEATS,
	clampHumans,
	clampLevels,
	clampSeats,
	seatChoicesWithin,
	tableOf,
	type SeatBounds,
	type Table,
} from './seats';
import {
	DEFAULT_TABLE_CYCLES,
	FEWEST_TABLE_SEATS,
	MOST_TABLE_SEATS,
	NO_GAME_OPTIONS,
	clampTableCycles,
	defaultOptionValues,
	encodeTableOptions,
	type TableOptionField,
	type TableOptions,
} from './table';
import {RANDOM_LEVEL, type AiLevel} from '../core/strategy';

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
 * HOTSEAT IS ONE MORE NUMBER HERE AND NOTHING ELSE. How many of the seats are
 * people at this device is decided with the seats and for the same reason (each
 * of them is staked while the game is built), and it is offered only up to what
 * the game says it can play (`humansAtMost`, 1 meaning no hotseat). Everything
 * else hotseat needs, the accounts, the revealer and the handover, is the
 * game's world and `./hotseat`, not the lobby's.
 *
 * AND SO IS A LEVEL PER WORLD SEAT: how each seat the world plays plays
 * (`random`, today's derived turn, or a level the game's strategy offers),
 * chosen with the seats and fixed for that game, offered only when the game
 * offers levels (`levels`). A seat's level changes how it plays, never which
 * key it plays with.
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

/**
 * WHAT IS BUILT AROUND THE SEATS: a TABLE (a game for a fixed set of players,
 * created by the first person, started once everyone is seated and ended after
 * the cycles chosen: `./table`) or the WORLD (the persistent game, which never
 * ends). A game whose tables can be played offline offers both, a table first;
 * a game without, the world only, and the question is not asked.
 */
export type LobbyMode = 'table' | 'world';

/** The seats a table offers: the online table's, two to eight. */
export const TABLE_SEATS: SeatBounds = {
	fewest: FEWEST_TABLE_SEATS,
	most: MOST_TABLE_SEATS,
};

/** What a table is created with, once its seats are taken. */
export type TableChoice = {
	table: Table;
	/** How many cycles it plays, clamped to what the online lobby allows. */
	cycles: number;
	/** The game's own options, as the `bytes32` it is created with. */
	gameOptions: `0x${string}`;
};

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
	/** A table or the world: see {@link LobbyMode}. */
	mode: LobbyMode;
	/** The modes offered, the table first. One means the question is not asked. */
	modeChoices: readonly LobbyMode[];
	/** How many seats. */
	seats: number;
	/** Every count of seats offered in this mode. */
	seatChoices: readonly number[];
	/**
	 * How many cycles a table plays, as chosen: clamped when the table is
	 * created rather than while it is typed. Unused by the world.
	 */
	cycles: number;
	/** The game's own options at a table (`lobby.options`); empty if none. */
	optionFields: readonly TableOptionField[];
	/** The value chosen for each of them, as entered (clamped when sent). */
	optionValues: Readonly<Record<string, number | string>>;
	/**
	 * How many of them are people at this device (hotseat): 1 unless the game
	 * can play more and the player chose more.
	 */
	humans: number;
	/** The most the game can seat at this device. 1 means no hotseat. */
	humansAtMost: number;
	/** Every count of people at this device the lobby offers at these seats. */
	humanChoices: readonly number[];
	/**
	 * Each world seat's level, in seat order, one per seat the world plays:
	 * `random` unless the player chose another.
	 */
	levels: readonly string[];
	/** The levels the game offers. Empty means no choice is shown. */
	levelChoices: readonly AiLevel[];
	/** Who is in each of them. See `./seats`. */
	table: Table;
};

/**
 * THE TABLES A GAME OFFERS OFFLINE: how one is set up, and what the creator
 * chooses for the game there. A lobby given this offers a table, first; one
 * given nothing offers the world only.
 */
export type LobbyTables = {
	/**
	 * Set a table up around these seats, once they are taken. Fire and forget,
	 * as {@link LobbyDeps.startGame}.
	 */
	start(choice: TableChoice): void;
	/** The game's own options at a table, if it reads any. */
	options?: TableOptions;
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
	/**
	 * Where to remember how many of the seats are people at this device. A
	 * WIRE like the seats key, and read as 1 when absent, which is what every
	 * game built before hotseat was. Omitted by a game that has no hotseat.
	 */
	humansStorageKey?: string;
	/**
	 * The most people at this device the game can play (1, the default, means
	 * no hotseat). The game's to say, because it is the game's world that
	 * provisions each of them.
	 */
	humansAtMost?: number;
	/**
	 * Where to remember each world seat's level: a JSON array of level ids, one
	 * per world seat. A WIRE like the seats key; absent is read as every seat
	 * `random`, and an entry it cannot read, or a level the game does not offer,
	 * as `random` too. Omitted by a game that offers no levels.
	 */
	levelsStorageKey?: string;
	/** The levels the game's world seats may play at. Absent or empty: none. */
	levels?: readonly AiLevel[];
	/**
	 * The game's tables, when it can play them here: the lobby then asks "a
	 * table or the world?", a table in a fresh choice. Absent: the world only.
	 */
	tables?: LobbyTables;
	/**
	 * Where to remember which mode the game here was built in (`table` or
	 * `world`). A WIRE like the seats key, and WRITTEN on every sit-down, the
	 * world included: a game from before modes has none, is read as the world
	 * (which is all it could be), and has it written on its first boot, so
	 * after one boot no record is implicit.
	 */
	modeStorageKey?: string;
	/** Where to remember the cycles a table was created to play. A wire. */
	cyclesStorageKey?: string;
	/**
	 * Where to remember the game's options a table was created with, as the
	 * `bytes32` sent. A wire.
	 */
	gameOptionsStorageKey?: string;
	/**
	 * The level a world seat STARTS AT in a fresh choice, before the player
	 * picks one: the game's own, since it knows which level is the one worth
	 * playing. Absent, or a level it does not offer: `random`. A world being
	 * restored is never read with it (see `clampLevels`).
	 */
	defaultLevel?: string;
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
	/** A table or the world: a mode not offered is ignored. */
	chooseMode(mode: LobbyMode): void;
	/** Pick a different number of seats, before sitting down at them. */
	chooseSeats(seats: number): void;
	/** How many cycles a table plays (clamped when it is created). */
	chooseCycles(cycles: number | string): void;
	/** A value for one of the game's options at a table. */
	chooseOption(id: string, value: number | string): void;
	/** Pick how many of the seats are people at this device (hotseat). */
	chooseHumans(humans: number): void;
	/**
	 * Pick the level of one world seat, by its place among the WORLD's seats
	 * (0 is the first seat the world plays). A level the game does not offer
	 * is read as `random`.
	 */
	chooseLevel(worldSeat: number, level: string): void;
	/**
	 * Take the table, and build the game around it.
	 *
	 * The count is recorded BEFORE the boot rather than after it, so a boot
	 * interrupted half way (a closed tab, a failed deploy) is still remembered
	 * as the table that game was being built for. The alternative loses the
	 * answer precisely when the game is in the state hardest to reason about.
	 */
	sitDown(seats?: number, humans?: number, levels?: readonly string[]): void;
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
	const atMost = Math.max(1, Math.floor(deps.humansAtMost ?? 1));
	const offers = deps.levels ?? [];
	/** What a seat the player has not chosen for yet starts at. */
	const choosing = deps.defaultLevel ?? RANDOM_LEVEL;
	const modes: readonly LobbyMode[] = deps.tables
		? ['table', 'world']
		: ['world'];
	const optionFields = deps.tables?.options?.fields ?? [];
	const freshOptions = (): Record<string, number | string> =>
		deps.tables?.options ? defaultOptionValues(deps.tables.options) : {};
	/** The choices other than the seats, carried from state to state. */
	type Choices = Pick<LobbyState, 'mode' | 'cycles' | 'optionValues'>;
	const seated = (
		step: LobbyState['step'],
		choices: Choices,
		seats: number,
		humans: number,
		levels: unknown,
		padding: string = choosing,
	) =>
		seatedAt(
			step,
			{...choices, modeChoices: modes, optionFields},
			seats,
			humans,
			atMost,
			levels,
			offers,
			padding,
		);
	/** A fresh choice: a table when the game offers one. */
	const fresh = (): Choices => ({
		mode: modes[0],
		cycles: DEFAULT_TABLE_CYCLES,
		optionValues: freshOptions(),
	});
	const lobby = writable<LobbyState>(
		seated('Opening', fresh(), SEATS_BY_DEFAULT, 1, []),
	);
	const choicesOf = (state: LobbyState): Choices => ({
		mode: state.mode,
		cycles: state.cycles,
		optionValues: state.optionValues,
	});
	const read = (key: string | undefined) =>
		key ? localStorage.getItem(key) : null;

	/**
	 * Whether there is a table to go back to, and how big it was.
	 *
	 * BOTH OR NEITHER. A seat record with no game behind it is not a game to
	 * carry on with, so it is ignored rather than acted on: the alternative boots
	 * a brand new game at a remembered count without ever asking, which is the
	 * silent reuse this file exists to avoid. The humans' count is read with it,
	 * and its absence means one (a game from before hotseat).
	 */
	//
	// AND WITH IT EVERY OTHER RECORD, each read with the default a game from
	// before it was built at: the mode as the world (all such a game could
	// be), the cycles as the default and the options as none (a world reads
	// neither). The sit-down that follows WRITES them all, so the tolerance
	// acts once per browser and then has nothing left to read.
	function tableAlreadyHere():
		| {choices: Choices; seats: number; humans: number; levels: unknown}
		| undefined {
		if (typeof localStorage === 'undefined') return undefined;
		if (!deps.gameAlreadyHere()) return undefined;
		const seats = localStorage.getItem(deps.seatsStorageKey);
		if (seats === null) return undefined;
		const humans = read(deps.humansStorageKey);
		const levels = read(deps.levelsStorageKey);
		// A TABLE THIS BUILD CANNOT PLAY is read as the world: a game that
		// stopped offering tables offline. Not a case any build here produces.
		const mode: LobbyMode =
			read(deps.modeStorageKey) === 'table' && modes.includes('table')
				? 'table'
				: 'world';
		const bounds = boundsOf(mode);
		const count = clampSeats(seats, bounds);
		const cycles = read(deps.cyclesStorageKey);
		return {
			choices: {
				mode,
				cycles: clampTableCycles(cycles === null ? NaN : Number(cycles)),
				optionValues: freshOptions(),
			},
			seats: count,
			humans: clampHumans(humans ?? 1, count, atMost, bounds),
			levels,
		};
	}

	function sitDown(
		seats: number = SEATS_BY_DEFAULT,
		humans: number = get(lobby).humans,
		levels: unknown = get(lobby).levels,
		padding: string = choosing,
		choices: Choices = choicesOf(get(lobby)),
		restoredOptions?: string | null,
	): void {
		const state = seated('Sat', choices, seats, humans, levels, padding);
		const cycles = clampTableCycles(state.cycles);
		// THE OPTIONS SENT: what a restore stored, else what was chosen, encoded
		// by the game; none at the world, or for a game that reads none.
		const gameOptions =
			state.mode !== 'table'
				? NO_GAME_OPTIONS
				: isBytes32(restoredOptions)
					? restoredOptions
					: deps.tables?.options
						? encodeTableOptions(deps.tables.options, state.optionValues)
						: NO_GAME_OPTIONS;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(deps.seatsStorageKey, String(state.seats));
			if (deps.humansStorageKey) {
				localStorage.setItem(deps.humansStorageKey, String(state.humans));
			}
			if (deps.levelsStorageKey) {
				localStorage.setItem(
					deps.levelsStorageKey,
					JSON.stringify(state.levels),
				);
			}
			if (deps.modeStorageKey) {
				localStorage.setItem(deps.modeStorageKey, state.mode);
			}
			if (deps.cyclesStorageKey) {
				localStorage.setItem(deps.cyclesStorageKey, String(cycles));
			}
			if (deps.gameOptionsStorageKey) {
				localStorage.setItem(deps.gameOptionsStorageKey, gameOptions);
			}
		}
		lobby.set({...state, cycles});
		if (state.mode === 'table' && deps.tables) {
			deps.tables.start({table: state.table, cycles, gameOptions});
		} else {
			deps.startGame(state.table);
		}
	}

	return {
		subscribe: lobby.subscribe,
		enter(): void {
			if (get(lobby).step !== 'Opening') return;
			const already = tableAlreadyHere();
			if (already === undefined) {
				lobby.set(seated('Choosing', fresh(), SEATS_BY_DEFAULT, 1, []));
				return;
			}
			// A RESTORE, so what the record does not say is `random`: that is
			// how the world it describes was built.
			sitDown(
				already.seats,
				already.humans,
				already.levels,
				RANDOM_LEVEL,
				already.choices,
				read(deps.gameOptionsStorageKey),
			);
		},
		chooseMode(mode: LobbyMode): void {
			if (!modes.includes(mode)) return;
			const state = get(lobby);
			lobby.set(
				seated(
					'Choosing',
					{...choicesOf(state), mode},
					state.seats,
					state.humans,
					state.levels,
				),
			);
		},
		chooseSeats(seats: number): void {
			const state = get(lobby);
			lobby.set(
				seated('Choosing', choicesOf(state), seats, state.humans, state.levels),
			);
		},
		chooseCycles(cycles: number | string): void {
			const parsed = typeof cycles === 'string' ? Number(cycles) : cycles;
			lobby.update((state) => ({...state, cycles: parsed}));
		},
		chooseOption(id: string, value: number | string): void {
			if (!optionFields.some((field) => field.id === id)) return;
			lobby.update((state) => ({
				...state,
				optionValues: {...state.optionValues, [id]: value},
			}));
		},
		chooseHumans(humans: number): void {
			const state = get(lobby);
			lobby.set(
				seated('Choosing', choicesOf(state), state.seats, humans, state.levels),
			);
		},
		chooseLevel(worldSeat: number, level: string): void {
			const state = get(lobby);
			const next = [...state.levels];
			if (worldSeat < 0 || worldSeat >= next.length) return;
			next[worldSeat] = level;
			lobby.set(
				seated('Choosing', choicesOf(state), state.seats, state.humans, next),
			);
		},
		sitDown: (seats, humans, levels) => sitDown(seats, humans, levels),
		leaveTheTable(): void {
			deps.forgetGame();
			if (typeof localStorage !== 'undefined') {
				for (const key of [
					deps.seatsStorageKey,
					deps.humansStorageKey,
					deps.levelsStorageKey,
					deps.modeStorageKey,
					deps.cyclesStorageKey,
					deps.gameOptionsStorageKey,
				]) {
					if (key) localStorage.removeItem(key);
				}
			}
			if (typeof location !== 'undefined') location.reload();
		},
	};
}

/** The seats a mode offers: a table's are the online table's. */
function boundsOf(mode: LobbyMode): SeatBounds {
	return mode === 'table' ? TABLE_SEATS : WORLD_SEATS;
}

function isBytes32(value: unknown): value is `0x${string}` {
	return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function seatedAt(
	step: LobbyState['step'],
	choices: Pick<
		LobbyState,
		'mode' | 'modeChoices' | 'cycles' | 'optionFields' | 'optionValues'
	>,
	seats: number,
	humans: number,
	humansAtMost: number,
	levels: unknown,
	offers: readonly AiLevel[],
	padding: string,
): LobbyState {
	const bounds = boundsOf(choices.mode);
	const count = clampSeats(seats, bounds);
	const here = clampHumans(humans, count, humansAtMost, bounds);
	// A SEAT KEEPS ITS LEVEL while the others change: the list is per world
	// seat, cut when the count of them falls, and padded with `padding` (the
	// game's default in a choice, `random` in a restore) when it grows.
	const worldLevels = clampLevels(levels, count - here, offers, padding);
	return {
		step,
		...choices,
		seats: count,
		seatChoices: seatChoicesWithin(bounds),
		humans: here,
		humansAtMost,
		humanChoices: Array.from(
			{length: Math.min(count, humansAtMost)},
			(_, i) => i + 1,
		),
		levels: worldLevels,
		levelChoices: offers,
		table: tableOf(count, here, worldLevels, bounds),
	};
}

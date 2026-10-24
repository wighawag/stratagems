/**
 * The seams a game fills in.
 *
 * This file is the contract between the commit-reveal framework and the game
 * built on it. Everything here is a type: no implementation, no imports from
 * any particular game. If you are writing a game on this template, these are
 * the things you supply; everything else the framework provides.
 *
 * The shapes were derived from four games that already exist, so they are
 * descriptive rather than speculative:
 *
 * - reveal-or-die and bomber-world identify a player by an ERC721 token id
 * - conquest identifies a player by an owner-derived empire id
 * - stratagems identifies a player by their account address, and builds its
 *   state by replaying events through an indexer rather than reading contracts
 *
 * Anything those four disagree about is a seam. Anything they agree about
 * (notably the cycle maths) belongs to the framework.
 */
import type {Readable} from 'svelte/store';

// ----------------------------------------------------------------------------
// Player identity
// ----------------------------------------------------------------------------

/**
 * What identifies a player to the game contract.
 *
 * Deliberately open: a game picks its own. An ERC721 token id and an
 * owner-derived id are both `bigint`; an account-keyed game uses the address
 * itself. The framework never inspects this, it only carries it from the
 * player's local state to the contract calls the game supplies.
 */
export type PlayerIdentity = bigint | `0x${string}`;

// ----------------------------------------------------------------------------
// Onchain state
// ----------------------------------------------------------------------------

/** Not-yet-loaded, or loaded with the game's own state shape. */
export type OnchainStateValue<TState> =
	{step: 'Unloaded'} | ({step: 'Loaded'} & TState);

/**
 * How current the state is, and why it might not be.
 *
 * `loading` covers both a poller's in-flight fetch and an indexer's catch-up,
 * so a UI can show one spinner either way. An error is kept while retrying so
 * consumers do not flicker between error and loading.
 */
export type OnchainStateStatus = {
	loading: boolean;
	error?: {message: string; cause?: unknown};
	/** Timestamp (ms) of the last time the state was known current. */
	lastSuccessfulFetch?: number;
};

/**
 * The state seam.
 *
 * Deliberately small, because the two ways of producing it have almost nothing
 * else in common:
 *
 * - reading contracts on an interval, scoped to what the camera can see
 * - replaying events through a client-side indexer, driven by new blocks
 *
 * Both end at "a store of game state that can be asked to become current", so
 * that is all this promises. A game supplies one; the framework, the view layer
 * and the RPC-health banner only ever see this.
 */
export type OnchainStateStore<TState> = {
	subscribe: Readable<OnchainStateValue<TState>>['subscribe'];
	status: Readable<OnchainStateStatus>;
	/** Bring the state up to date now; resolves once it is. */
	update(): Promise<void>;
};

// ----------------------------------------------------------------------------
// View state
// ----------------------------------------------------------------------------

/**
 * What the renderer draws: onchain state with the player's local, not-yet-onchain
 * intent layered on top. Games define the entity shape; the framework only needs
 * to know which cycle the view belongs to, so it can tell stale from current.
 */
export type ViewStateValue<TView> =
	{step: 'Unloaded'} | ({step: 'Loaded'; cycleNumber: number} & TView);

export type ViewStateStore<TView> = {
	subscribe: Readable<ViewStateValue<TView>>['subscribe'];
	status: Readable<OnchainStateStatus>;
};

// ----------------------------------------------------------------------------
// Commit / reveal
// ----------------------------------------------------------------------------

/**
 * The two contract calls that make a commit-reveal submission, as the game
 * exposes them.
 *
 * The framework owns the SUBMISSION: it decides when committing is still
 * allowed, keeps the secret until the reveal phase, and drives the reveal. It
 * does not know the contract's function names or argument order, because those
 * differ per game (some commit as msg.sender and take a player argument only on
 * reveal, so that a third party can reveal on the player's behalf).
 */
export type CommitRevealAdapter<TIdentity extends PlayerIdentity, TAction> = {
	/**
	 * Pack the player's actions into the bytes the contract will hash, and the
	 * commitment hash itself. Kept together because a game's hash must match its
	 * own packing exactly.
	 */
	buildCommitment(params: {
		actions: readonly TAction[];
		secret: `0x${string}`;
	}): {hash: `0x${string}`; encoded: `0x${string}`};

	/**
	 * Submit the commitment for this cycle.
	 *
	 * This deliberately receives everything the submission knows, not just the
	 * hash. Two reasons, both taken from games that already exist:
	 *
	 * `actions`, because what a game puts at stake AT COMMIT TIME is usually a
	 * function of what was planned: the template bonds the exact cost of its
	 * placements, and a bond that is too small makes the reveal revert once the
	 * commitment is already immovable. It cannot be recovered from the hash,
	 * which is the one thing a commitment hash is for.
	 *
	 * `secret` and `revealDueAt`, because a game may want the reveal to happen
	 * WITHOUT this browser. Stratagems and catacombs hand a timelock-encrypted
	 * reveal transaction to a scheduling service (fuzd, encrypted to a drand
	 * round) at commit time, so that a player who closes the tab still reveals
	 * and keeps their stake. Both run a 23h/1h commit/reveal split, where nobody
	 * can be expected at the keyboard for the reveal hour. Building that payload
	 * needs the secret and the time the reveal falls due, and commit is the only
	 * moment it can be done.
	 *
	 * Scheduling is an ADDITION, never a replacement: the player can always
	 * reveal themselves, and a game with a short cycle (or a hot-seat setup where
	 * turns are simply waited out) needs no scheduler at all. See `autoReveal` on
	 * the submission for how the two combine.
	 *
	 * Handing over the secret is not a leak: this runs in the player's own
	 * client, and the adapter is the code that will disclose it a phase later
	 * regardless.
	 */
	commit(params: {
		identity: TIdentity;
		hash: `0x${string}`;
		actions: readonly TAction[];
		secret: `0x${string}`;
		cycleNumber: number;
		/**
		 * Chain time, in seconds, at which the reveal phase for this cycle opens.
		 * Undefined on a manually advanced chain, which has no clock to predict.
		 */
		revealDueAt?: number;
	}): Promise<{hash: `0x${string}`}>;

	/**
	 * Open the commitment, in however many transactions that takes.
	 *
	 * ONE CALL, NOT NECESSARILY ONE TRANSACTION, and the difference is the
	 * framework's to know about because it is what `onProgress` exists for. Every
	 * chain has a gas ceiling, so a game whose turns can outgrow one transaction
	 * commits them as a hash chain and opens them in pieces; the template's own
	 * game does exactly that. The submission does not know how the pieces are
	 * cut, only that this resolves when the whole turn is open.
	 *
	 * WHERE IT RESUMES FROM IS THE ADAPTER'S PROBLEM AND MUST NOT BE MEMORY. A
	 * reveal interrupted halfway is retried by calling this again with the same
	 * arguments, so an adapter that sends pieces has to ask the chain how far it
	 * got rather than remember: this browser may not be the one that sent the
	 * earlier pieces, and a submission restored from storage or recovered from a
	 * hash knows nothing about them at all.
	 *
	 * @param onProgress Reports how many pieces are done out of how many, for a
	 *        UI that has to say something during a reveal that takes a while. A
	 *        one-transaction game never calls it and nothing downstream requires
	 *        it to.
	 */
	reveal(params: {
		identity: TIdentity;
		actions: readonly TAction[];
		secret: `0x${string}`;
		onProgress?: (progress: {done: number; total: number}) => void;
	}): Promise<{hash: `0x${string}`}>;
};

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------

/**
 * Where the camera is and how far it is zoomed in.
 *
 * Declared here rather than in `$lib/game/render` because it is part of the
 * RENDER CONTRACT: it is what `Frame` carries, so a renderer depends on it.
 * Keeping it here means `game/core` needs nothing from `game/render`, and the
 * dependency runs one way. `view-transform.ts` holds the arithmetic over it.
 *
 * Two conventions, and confusing them is the only way to be wrong with these:
 * a WORLD unit is a GAME unit (a cell, not a pixel), and `scale` is CSS PIXELS
 * PER WORLD UNIT.
 */
export type ViewTransform = {
	/** World point at the centre of the screen. */
	centerX: number;
	centerY: number;
	/** CSS pixels per world unit. Always > 0 once a surface has a size. */
	scale: number;
};

/** A surface's size in CSS pixels. */
export type ScreenSize = {width: number; height: number};

/**
 * What a renderer is told on every frame.
 *
 * Carries the clock AND the view transform, because the two rendering styles
 * this template supports need different halves of it and neither should have to
 * reach for a store to get it:
 *
 * - an IMMEDIATE renderer redraws from scratch each frame, so it needs the
 *   transform in order to draw anything at all.
 * - a STATEFUL renderer usually has the transform applied for it by the host,
 *   but still reads the scale for anything resolution-dependent (level of
 *   detail, a grid that fades out as you zoom away, line widths that must not
 *   scale).
 */
export type Frame = {
	/** Milliseconds since the surface started. */
	timeMs: number;
	/**
	 * MILLISECONDS since the previous tick. Zero on the first.
	 *
	 * The unit is in the NAME because leaving it in the doc comment cost a
	 * real bug: a renderer passed this straight into an animation that thought
	 * in seconds, so every replay finished in a single frame and read as a
	 * jump rather than a movement. No unit test could catch it - each side was
	 * correct and tested in its own units, and the mismatch existed only where
	 * they met. A name is the only place a unit survives being passed through
	 * a function argument.
	 *
	 * Multiply by 0.001 for a seconds-based animation; do not assume 1/60.
	 */
	deltaMs: number;
	/** What the surface is drawing with this frame. Game units, CSS pixels. */
	transform: ViewTransform;
	/** The surface size in CSS pixels. */
	screen: ScreenSize;
	/**
	 * Backing-store pixels per CSS pixel, as the host has ACTUALLY configured
	 * its buffer. For a renderer that sizes things in device pixels (a crisp
	 * hairline, a texture atlas choice).
	 *
	 * Not necessarily `window.devicePixelRatio`: a host may deliberately render
	 * at CSS resolution, and the pixi one does, because the art is pixelated and
	 * upscaling it defeats the point. What this reports is the buffer the
	 * renderer is drawing into, which is the only number it can act on.
	 */
	devicePixelRatio: number;
};

/**
 * The render seam.
 *
 * Not tied to a rendering library: the pixi games and the WebGL one both fit,
 * because all the framework does is start it, stop it, and let it tick. What a
 * "surface" is (a pixi Container, a 2D context, a WebGL context) is the
 * renderer's business, so it is the renderer's own type parameter.
 *
 * The template ships three ways to fill this seam, in `$lib/game/render`:
 * `createStatefulRenderer` (scene graph, diffed), `createImmediateRenderer`
 * (redraw per frame), and nothing at all for a Svelte-rendered game, which
 * subscribes to the view state like any other component. See the README there.
 */
export type GameRenderer<TSurface> = {
	onAppStarted(surface: TSurface): void;
	onAppStopped(): void;
	/** Per-frame hook. The only entry point an immediate renderer needs. */
	tick(frame: Frame): void;
};

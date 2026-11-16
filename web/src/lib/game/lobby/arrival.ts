/**
 * ARRIVING OR RELOADING: what a lobby does when it opens on a browser that may
 * already hold a game.
 *
 * WHY IT IS ASKED AT ALL. A browser that holds a game used to boot straight
 * back into it, which is right for a reload and wrong for an arrival: a player
 * who had played once opened the offline route weeks later, found themselves
 * in an old world, and concluded there was nothing to configure. So an ARRIVAL
 * offers the choice (continue that game, or start a new one), and a RELOAD
 * resumes without asking, because asking a player mid-cycle the question they
 * answered a minute ago is the dialog with one answer.
 *
 * THE URL SAYS WHICH ONE IT IS, through {@link CONTINUE_PARAM}. Once a choice
 * is made (continuing, or sitting down at a new table) the route rewrites its
 * URL in place to carry the param, so every reload after it resumes: F5 in a
 * cycle, a suite that reloads mid-game, the one-tab take-over, whose holder
 * reloads. A bookmarked URL with the param resumes too, which is acceptable.
 * The alternative, a sessionStorage marker, was rejected: the param is visible
 * and needs no stored state of its own.
 *
 * Pure and route-agnostic: nothing here reads `location` or `$app/*`. The
 * route reads its URL and rewrites it; this only says what each URL means.
 */

/** The query param that says "this is a reload, resume the game here". */
export const CONTINUE_PARAM = 'continue';

/**
 * What a lobby does when it opens:
 *
 * - `continue`: boot the saved game, as a reload always did.
 * - `choose`: offer continuing the saved game or starting a new one.
 * - `setup`: the setup screen, for there is nothing here to continue.
 */
export type LobbyOpening = 'continue' | 'choose' | 'setup';

export type LobbyArrival = {
	/** Whether this browser holds a game (the game's own record says so). */
	saved: boolean;
	/**
	 * Whether that game can be restored: every record a boot needs is there.
	 * A saved game that cannot be is not offered, since continuing it could
	 * only fail; the lobby ignores its records, as it always has.
	 */
	restorable: boolean;
	/** Whether the URL asks to resume ({@link CONTINUE_PARAM}). */
	continueRequested: boolean;
};

export function openingOf(arrival: LobbyArrival): LobbyOpening {
	if (!arrival.saved || !arrival.restorable) return 'setup';
	return arrival.continueRequested ? 'continue' : 'choose';
}

/** Whether a URL's query (`?continue`, `?a=1&continue`, ...) asks to resume. */
export function isContinueRequested(search: string): boolean {
	return new URLSearchParams(search).has(CONTINUE_PARAM);
}

/**
 * The same URL with {@link CONTINUE_PARAM} added, every other param and the
 * hash kept, or undefined when it already has it (nothing to rewrite). Written
 * as a bare `?continue` rather than `?continue=`, since that is what a person
 * would type.
 */
export function withContinue(href: string): string | undefined {
	const url = new URL(href);
	if (url.searchParams.has(CONTINUE_PARAM)) return undefined;
	const others = url.search.replace(/^\?/, '');
	url.search = others ? `?${others}&${CONTINUE_PARAM}` : `?${CONTINUE_PARAM}`;
	return url.href;
}

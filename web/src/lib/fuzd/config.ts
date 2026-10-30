/**
 * WHETHER THIS APP SCHEDULES ITS REVEALS AT ALL, and how the browser reveals
 * as a result (P7). Each answer that is "no" is a supported configuration and
 * not a fault (R2): the layer degrades to its absence, which is `main`'s
 * behaviour, the browser revealing as soon as the phase opens.
 */

/** What a scheduler needs from the configuration, once it is known to exist. */
export type FuzdSettings = {
	/** The configured value: an ordinary URL, or `//:<port>` for the page's host. */
	uri: string;
	chainId: number;
	/** The chain's `expectedWorstGasPrice`, in wei. */
	maxFeePerGasAuthorized: bigint;
};

/** `expectedWorstGasPrice` off the chain's exported properties, if declared. */
function expectedWorstGasPrice(properties: unknown): bigint | undefined {
	if (!properties || typeof properties !== 'object') return undefined;
	const value = (properties as Record<string, unknown>).expectedWorstGasPrice;
	if (typeof value === 'bigint') return value;
	if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
		return BigInt(value);
	}
	if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
	return undefined;
}

/**
 * The settings, or `undefined` for every reason not to schedule:
 *
 * - no `PUBLIC_FUZD_URI`: no service is configured;
 * - an embedded chain (the offline world): a service cannot reach a chain that
 *   runs inside a tab;
 * - a chain that declares no `expectedWorstGasPrice`: nothing to price the
 *   reveal with, and a guessed price is a reveal fuzd may refuse to send at
 *   the moment it matters (P5).
 */
export function fuzdSettings(params: {
	uri: string | undefined;
	chain: {id: number; properties?: unknown};
	embedded: boolean;
}): FuzdSettings | undefined {
	const uri = params.uri?.trim();
	if (!uri || params.embedded) return undefined;
	const price = expectedWorstGasPrice(params.chain.properties);
	if (price === undefined || price === 0n) return undefined;
	return {uri, chainId: params.chain.id, maxFeePerGasAuthorized: price};
}

/**
 * How the browser reveals, given whether a scheduler is configured (P7).
 *
 * `fallback` with one: fuzd reveals as the phase opens, and this browser, if
 * still open, waits until half the phase has gone, asks the chain, and reveals
 * only if nobody has. A turn whose scheduling FAILED is revealed at once all the
 * same (the submission reads `revealScheduled: false` per turn). `immediately`
 * without one, which is `main`'s behaviour.
 */
export function revealModeFor(
	scheduled: boolean,
):
	| {autoReveal: 'fallback'; fallbackRevealAfter: number}
	| {autoReveal: 'immediately'} {
	return scheduled
		? {autoReveal: 'fallback', fallbackRevealAfter: 0.5}
		: {autoReveal: 'immediately'};
}

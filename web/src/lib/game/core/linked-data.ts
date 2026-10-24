/**
 * Reading what the deployment declared.
 *
 * A game's constants belong on chain, not in the front end: the phase
 * durations, the cost of an action, the address of the token at stake. The
 * deploy script records them as `linkedData` on the contract, and the client
 * reads them back, so changing a parameter in the deploy cannot leave the UI
 * describing a different game from the one being played.
 *
 * What arrives is `unknown`, and it arrives having been through JSON. That
 * makes every read below a place where a mistake is SILENT, which is the whole
 * reason these are functions rather than casts written out at each call site.
 *
 * **A number that is absent becomes `NaN`, not an error.** `Number(undefined)`
 * is `NaN`, and NaN propagates: a phase duration of NaN makes every comparison
 * false, so a clock simply stops advancing and no exception is ever raised.
 * That is the failure this file exists to convert into a sentence naming the
 * parameter.
 *
 * **A `uint256` arrives as a decimal STRING**, because JSON has no bigint, so
 * every one of these reads needs the same three-way coercion and every call
 * site was writing it out by hand.
 *
 * **A parameter added later is simply ABSENT from an older deployment**, and
 * that is not a failure. It is the case {@link optionalNumber} exists for, and
 * it is the one worth being careful about: a client that substitutes a default
 * is telling the player the rules of a game that is not the one they are
 * playing, confidently and with a number on it. Answering "we do not know" lets
 * the UI say what happened without quoting a figure this build happens to
 * believe.
 *
 * It reads any bag the deployment carries, not only `linkedData`: a chain's own
 * declared properties are the same shape and the same problem.
 */

/** Anything the deployment hands back as a bag of declared values. */
export type DeclaredValues = Record<string, unknown>;

/** What JSON can carry a numeric parameter as. */
type Numeric = string | number | bigint;

function missing(key: string, what: string): never {
	throw new Error(
		`The deployment declares no ${key}, which this build needs to read the ${what}. ` +
			`Check the deploy script records it, and that the app is pointed at a deployment made since it did.`,
	);
}

function present(values: DeclaredValues, key: string): boolean {
	const value = values[key];
	return value !== undefined && value !== null;
}

/**
 * A whole number the deployment must have declared.
 *
 * Throws when it is absent, rather than returning `NaN` and letting a clock
 * quietly stop.
 */
export function readNumber(values: DeclaredValues, key: string): number {
	if (!present(values, key)) missing(key, 'configuration');
	return Number(values[key] as Numeric);
}

/** A `uint256` the deployment must have declared, as it left Solidity. */
export function readBigInt(values: DeclaredValues, key: string): bigint {
	if (!present(values, key)) missing(key, 'configuration');
	return BigInt(values[key] as Numeric);
}

/** An address the deployment must have declared. */
export function readAddress(
	values: DeclaredValues,
	key: string,
): `0x${string}` {
	if (!present(values, key)) missing(key, 'configuration');
	return values[key] as `0x${string}`;
}

/**
 * A whole number the deployment MAY have declared.
 *
 * `undefined` means the deployment predates the parameter, which is a fact
 * about that deployment rather than an error. Whatever reads this has to be
 * able to say its piece without the number - see the file comment for why a
 * default would be worse than nothing.
 */
export function optionalNumber(
	values: DeclaredValues,
	key: string,
): number | undefined {
	return present(values, key) ? Number(values[key] as Numeric) : undefined;
}

/** The same, for a `uint256`. */
export function optionalBigInt(
	values: DeclaredValues,
	key: string,
): bigint | undefined {
	return present(values, key) ? BigInt(values[key] as Numeric) : undefined;
}

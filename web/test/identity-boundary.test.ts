import {describe, it, expect} from 'vitest';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

/**
 * NO SHARED MODULE NAMES THE CONCRETE IDENTITY TYPE.
 *
 * Rule N3 of Decision 3 in the plan on the `work` branch, enforced rather than
 * asserted. `with/nft-identity` is a branch of this repo where the reference
 * game's identity stops being an address and becomes a token id. Every shared
 * file that spells the identity out concretely is a file that branch has to
 * edit, and an edited shared file is a conflict site for as long as both sides
 * keep developing. The whole arrangement is worth exactly as much as the
 * number of such files, which is why this is a test and not a paragraph.
 *
 * THE RULE HAD TO BE CHOSEN CAREFULLY, and the obvious one is false. Banning
 * `0x${string}` from shared modules would fail on secrets, commitment hashes,
 * contract addresses, the payer, the owner and every signature - all of which
 * are addresses or hex in every configuration and must stay that way. A check
 * that fires on correct code is one somebody deletes, so this does not look at
 * the type at all.
 *
 * It looks at the FRAMEWORK'S IDENTITY-PARAMETERISED GENERICS instead. Those
 * are the sites where a type argument means "this is what a player IS", and
 * they are unambiguous: there is no other reason to pass a type to
 * `createSubmission`. Wherever application code instantiates one of them, the
 * identity argument has to be the alias.
 *
 * THE MIRROR-IMAGE RULE MATTERS JUST AS MUCH, and it is the second block
 * below: `game/core/` must NOT name the alias. The framework stays generic
 * over `TIdentity extends PlayerIdentity`, because that genericity is the
 * thing that makes a one-line difference possible at all. A well-meaning
 * simplification that hard-coded `GameIdentity` into the framework would leave
 * every assertion in the first block passing while destroying what they
 * protect.
 *
 * WRITTEN TO SURVIVE THE CASCADE. This file is inherited by every game built
 * on this template, where the layout is different: reveal-or-die has no
 * `lib/placement/` at all, and its alias is `bigint`. So nothing here asserts
 * that a particular file exists or that the alias has a particular value. It
 * enumerates what the repo actually has and judges that. The one previous
 * version of a check in this tree that encoded a fact about THIS repo's layout
 * passed here and failed on the first merge down, for a reason that had
 * nothing to do with the rule it was enforcing.
 */

/**
 * The framework generics whose type argument names the identity.
 *
 * `RecoveryStore` is deliberately NOT in this list: it is parameterised by the
 * ACTION only (`RecoveryStore<TAction>`). `createSubmissionRecovery` is the
 * identity-carrying half of that module and it is here.
 */
const IDENTITY_GENERICS = [
	'SubmissionStore',
	'createSubmission',
	'CommitRevealAdapter',
	'createDerivedSecret',
	'createSubmissionRecovery',
] as const;

const ALIAS = 'GameIdentity';

/** Where the framework lives. Generic by construction, and it must stay so. */
const FRAMEWORK = 'src/lib/game/core/';
/**
 * The framework's own tests.
 *
 * Exempt for the same reason the framework is, and the reason is worth stating
 * because it looks like a loophole. Those suites test `createSubmission`
 * itself, so a concrete type there is a TEST FIXTURE picking one instance of
 * the type parameter, not an application declaring what its players are. They
 * pin the ADDRESS case specifically, which is valuable exactly where it looks
 * redundant: in a descendant whose own identity is a `bigint`, the inherited
 * copies of these suites are the only coverage the address half of
 * `PlayerIdentity` has. Forcing them onto the alias would delete that, and
 * would break the descendant on the first cascade, since its alias is a
 * `bigint` and its fixtures are addresses.
 */
const FRAMEWORK_TESTS = 'test/lib/game/core/';

const root = new URL('..', import.meta.url).pathname;

function trackedFiles(): string[] {
	// Tracked files only, so a stray scratch file cannot fail the suite.
	return execFileSync('git', ['ls-files', 'src', 'test'], {
		cwd: root,
		encoding: 'utf8',
	})
		.split('\n')
		.filter((path) => /\.(ts|svelte)$/.test(path));
}

type Instantiation = {file: string; line: number; generic: string; arg: string};

/**
 * Comments out, code in.
 *
 * A doc comment that EXPLAINS one of these generics is not an instantiation of
 * it, and this file is the worst offender: the rule cannot be described
 * without writing the names down. Caught by the suite failing on its own
 * prose, which is the cheapest possible demonstration that a checker has to
 * look at code rather than at text.
 *
 * Line breaks are preserved so that the line numbers in a failure message
 * still point at the real line.
 */
function withoutComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
		.split('\n')
		.map((line) => line.replace(/\/\/.*$/, ''))
		.join('\n');
}

/**
 * Every explicit instantiation of an identity-parameterised generic.
 *
 * The identity is always the FIRST type argument, so the capture stops at the
 * first comma or closing angle bracket. Inference sites
 * (`createSubmissionRecovery` called with no type arguments at all) name
 * nothing and are not matched, which is correct: they cannot say the wrong
 * thing.
 */
function instantiationsIn(path: string): Instantiation[] {
	const source = withoutComments(readFileSync(`${root}${path}`, 'utf8'));
	const found: Instantiation[] = [];
	source.split('\n').forEach((text, index) => {
		for (const generic of IDENTITY_GENERICS) {
			// \b...\s*< so that `createSubmission<` does not match
			// `createSubmissionRecovery<` and `SubmissionStore<` does not match
			// `SubmissionStorage<`.
			const pattern = new RegExp(`\\b${generic}\\s*<\\s*([^,<>]+)`, 'g');
			let match: RegExpExecArray | null;
			while ((match = pattern.exec(text)) !== null) {
				found.push({
					file: path,
					line: index + 1,
					generic,
					arg: match[1].trim(),
				});
			}
		}
	});
	return found;
}

const files = trackedFiles();

const applicationFiles = files.filter(
	(path) => !path.startsWith(FRAMEWORK) && !path.startsWith(FRAMEWORK_TESTS),
);

const applicationInstantiations = applicationFiles.flatMap(instantiationsIn);

describe('the identity boundary', () => {
	it('finds the generics it is meant to police', () => {
		// Guards the guard. Every assertion below is driven by matching these
		// names, so a rename in the framework would make the whole suite pass by
		// finding nothing at all. Assert instead that each policed name is really
		// DECLARED in the framework, which is what gives the matching meaning.
		//
		// Deliberately not a count of files or of matches: this suite is
		// inherited by games whose layout differs from this one, and any
		// threshold would be wrong in at least one of them.
		const frameworkSource = files
			.filter((path) => path.startsWith(FRAMEWORK))
			.map((path) => readFileSync(`${root}${path}`, 'utf8'))
			.join('\n');

		expect(frameworkSource.length).toBeGreaterThan(0);
		for (const generic of IDENTITY_GENERICS) {
			expect(
				new RegExp(`\\b(type|function|const)\\s+${generic}\\b`).test(
					frameworkSource,
				),
				`${generic} is no longer declared in ${FRAMEWORK}. If it was renamed, ` +
					`rename it here too, or this suite silently polices nothing.`,
			).toBe(true);
		}
	});

	it('has an identity module that declares the alias', () => {
		// The single shared file the feature branch edits (rule N2). If it is
		// gone, the arrangement it exists for is gone with it.
		const modulePath = 'src/lib/game/identity.ts';
		expect(existsSync(`${root}${modulePath}`)).toBe(true);
		expect(
			new RegExp(`export type ${ALIAS}\\b`).test(
				readFileSync(`${root}${modulePath}`, 'utf8'),
			),
		).toBe(true);
	});

	it('reaches the application code it polices', () => {
		// Without this, a moved directory or a changed import style would make the
		// assertion below vacuously true: an empty list of offenders is what both
		// a clean repo and a broken scan look like.
		//
		// SOURCE ONLY, deliberately. The rule itself covers application tests too
		// - a test that pins the identity concretely is exactly as much of a
		// conflict site as a module that does - but requiring the scan to FIND one
		// would be asserting a fact about a repo's test layout rather than about
		// the rule. This repo happens to have none: the only suites that
		// instantiate these generics are the framework's own, which are exempt
		// above for a reason of their own. A descendant may have several. Neither
		// says anything about whether the boundary is being kept.
		const inSource = applicationInstantiations.filter((i) =>
			i.file.startsWith('src/'),
		);
		expect(
			inSource.length,
			`no application module instantiates any of ${IDENTITY_GENERICS.join(', ')}. ` +
				`Either the composition root moved, or these were renamed; until that ` +
				`is fixed this suite is not checking anything.`,
		).toBeGreaterThan(0);
	});

	it('names the identity only through the alias, never concretely', () => {
		const offenders = applicationInstantiations.filter((i) => i.arg !== ALIAS);
		expect(
			offenders.map((i) => `${i.file}:${i.line} ${i.generic}<${i.arg}`),
			`these name the identity concretely instead of using ${ALIAS} from ` +
				`$lib/game/identity. Every one of them is a file that ` +
				`with/nft-identity would have to edit and conflict on forever. ` +
				`Import the alias and pass that instead.`,
		).toEqual([]);
	});

	it('keeps the framework generic, so the alias can differ in one line', () => {
		// The other half of the rule. `game/core/` is parameterised over
		// `TIdentity extends PlayerIdentity` and must never reach for the app's
		// choice, or a branch that changes the choice changes the framework.
		const offenders = files
			.filter((path) => path.startsWith(FRAMEWORK))
			.filter((path) =>
				new RegExp(`\\b${ALIAS}\\b`).test(
					readFileSync(`${root}${path}`, 'utf8'),
				),
			);
		expect(
			offenders,
			`the framework must not name ${ALIAS}: it is generic over ` +
				`TIdentity extends PlayerIdentity, and that genericity is what makes ` +
				`the identity a one-line difference between branches.`,
		).toEqual([]);
	});
});

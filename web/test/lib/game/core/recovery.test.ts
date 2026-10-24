import {describe, expect, it} from 'vitest';
import {get, writable} from 'svelte/store';
import {
	createSubmissionRecovery,
	type LiveCommitment,
} from '$lib/game/core/recovery';

/** A game's action, standing in for whatever a real one has. */
type Placement = {cellID: bigint};
import type {SubmissionState, SubmissionStore} from '$lib/game/core/submission';

const player = '0x1111111111111111111111111111111111111111' as const;

/**
 * The submission, as much of it as this store touches: a state it reads and the
 * one method the framework gained for this.
 */
function fakeSubmission(initial: SubmissionState<Placement> = {step: 'Idle'}) {
	const state = writable<SubmissionState<Placement>>(initial);
	const adopted: unknown[] = [];
	let accept = true;
	const submission = {
		subscribe: state.subscribe,
		get value() {
			return get(state);
		},
		plan: () => {},
		commit: async () => {},
		reveal: async () => {},
		dismiss: () => {},
		adopt: (submission: {
			cycleNumber: number;
			actions: readonly Placement[];
		}) => {
			adopted.push(submission);
			if (accept) {
				state.set({
					step: 'Committed',
					cycleNumber: submission.cycleNumber,
					actions: submission.actions,
				});
			}
			return accept;
		},
		start: () => () => {},
	} as unknown as SubmissionStore<`0x${string}`, Placement>;
	return {submission, adopted, state, refuse: () => (accept = false)};
}

/**
 * A hash that depends on the plan and the secret, exactly as the real one
 * does, without pulling in the encoding.
 */
const buildCommitment = ({
	actions,
	secret,
}: {
	actions: readonly Placement[];
	secret: `0x${string}`;
}) => ({
	hash: `0x${secret.slice(2)}:${actions
		.map(({cellID}) => cellID)
		.join(',')}` as `0x${string}`,
});

function setup(options?: {
	live?: LiveCommitment;
	submission?: SubmissionState<Placement>;
}) {
	const {submission, adopted, state, refuse} = fakeSubmission(
		options?.submission,
	);
	const commitment = writable<LiveCommitment | undefined>(options?.live);
	const recovery = createSubmissionRecovery({
		submission,
		commitment,
		identity: writable(player),
		makeSecret: () => '0xsecret' as `0x${string}`,
		buildCommitment,
	});
	recovery.subscribe(() => {});
	return {recovery, adopted, commitment, state, refuse};
}

const committed: LiveCommitment = {
	cycleNumber: 5,
	hash: '0xsecret:1,2' as `0x${string}`,
};

describe('a commitment the chain holds and this browser has no submission for', () => {
	it('says nothing when the chain holds nothing', () => {
		const {recovery} = setup();
		expect(get(recovery)).toEqual({step: 'Idle'});
	});

	it('reports a live commitment this browser cannot open', () => {
		const {recovery} = setup({live: committed});
		expect(get(recovery)).toEqual({step: 'Found', cycleNumber: 5});
	});

	it('says nothing when the submission already accounts for it', () => {
		// The ordinary case: storage had the submission, `restore()` took it up, and
		// there is nothing to recover. Reporting it would put a notice about a
		// lost submission in front of a player whose submission is fine.
		const {recovery} = setup({
			live: committed,
			submission: {step: 'Committed', cycleNumber: 5, actions: [{cellID: 1n}]},
		});
		expect(get(recovery)).toEqual({step: 'Idle'});
	});

	it('still reports it when the submission is merely PLANNING the same cycle', () => {
		// This is the trap. The chain says a commitment exists and the submission
		// says the player is still choosing, so the player is halfway to re-entering
		// their turn without being told that is what they are doing - and a plain
		// commit would replace the commitment they are trying to open.
		const {recovery} = setup({
			live: committed,
			submission: {step: 'Planning', cycleNumber: 5, actions: [{cellID: 1n}]},
		});
		expect(get(recovery)).toEqual({step: 'Found', cycleNumber: 5});
	});

	it('adopts a plan that opens the commitment, and sends nothing', async () => {
		const {recovery, adopted} = setup({live: committed});

		const ok = await recovery.offer([{cellID: 1n}, {cellID: 2n}]);

		expect(ok).toBe(true);
		expect(adopted).toEqual([
			{
				cycleNumber: 5,
				actions: [{cellID: 1n}, {cellID: 2n}],
				secret: '0xsecret',
				committed: true,
			},
		]);
	});

	it('REFUSES a plan whose hash does not match, and adopts nothing', async () => {
		// The whole safety property. You cannot "recover" a plan you did not
		// commit, which is why offering this route to everyone grants an attacker
		// nothing - and it is why a player who misremembers their own turn is told
		// so rather than having a wrong turn revealed on their behalf.
		const {recovery, adopted} = setup({live: committed});

		const ok = await recovery.offer([{cellID: 1n}, {cellID: 3n}]);

		expect(ok).toBe(false);
		expect(adopted).toEqual([]);
		expect(get(recovery)).toEqual({step: 'Refused', cycleNumber: 5});
	});

	it('lets a refused player try again, and then goes quiet', async () => {
		// GOING QUIET IS THE POINT. There is no `Recovered` state, because a
		// recovered submission is a restored one and this store must not be the one
		// thing in the app that can tell the difference. Once adopted, the submission
		// itself reports `Committed` and owes a reveal.
		const {recovery, state} = setup({live: committed});

		expect(await recovery.offer([{cellID: 9n}])).toBe(false);
		expect(get(recovery)).toMatchObject({step: 'Refused'});

		expect(await recovery.offer([{cellID: 1n}, {cellID: 2n}])).toBe(true);
		expect(get(recovery)).toEqual({step: 'Idle'});
		expect(get(state)).toMatchObject({step: 'Committed', cycleNumber: 5});
	});

	it('does not report a refusal the player did not cause', async () => {
		// The submission declined the adoption - the cycle turned over while they
		// were clicking, or a commit of their own is in flight. Neither is a wrong
		// plan, and saying "that is not what you committed" would send them looking
		// for a mistake they did not make.
		const {recovery, adopted, refuse} = setup({live: committed});
		refuse();

		const ok = await recovery.offer([{cellID: 1n}, {cellID: 2n}]);

		expect(ok).toBe(false);
		expect(adopted).toHaveLength(1);
		expect(get(recovery)).toEqual({step: 'Found', cycleNumber: 5});
	});

	it('forgets a refusal once the chain moves on', async () => {
		// A refusal is about ONE commitment. Carrying it into the next submission
		// would tell a player their new turn was wrong before they had made one.
		const {recovery, commitment} = setup({live: committed});
		await recovery.offer([{cellID: 9n}]);
		expect(get(recovery)).toMatchObject({step: 'Refused'});

		commitment.set({cycleNumber: 6, hash: '0xsecret:4' as `0x${string}`});
		expect(get(recovery)).toEqual({step: 'Found', cycleNumber: 6});
	});
});

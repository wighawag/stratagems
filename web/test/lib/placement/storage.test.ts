import {describe, expect, it, vi} from 'vitest';
import {get} from 'svelte/store';
import {createAccountData} from '$lib/account/AccountData';
import {SUBMISSION_FIELDS} from '$lib/game/core/commit-reveal/storage';
import {createSubmissionStorage} from '$lib/placement/storage';
import {
	ALICE,
	SCOPE,
	accountStore,
	clock,
	controlledStorage,
	deployments,
	storageKey,
} from '../account/account-data-harness';

/**
 * THE WIRE, as this game writes it. Its records are a wire once it has players
 * (AGENTS.md, "Commit-reveal rules"); they live in the account data since step
 * 8 (P8), and the localStorage keys they had before were deleted rather than
 * read as a fallback, because nothing was deployed to hold one. What is pinned
 * is where a record lands and how a placement is written in it.
 */
const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000000aa' as const;

describe("the reference game's submission storage", () => {
	it('writes its records into the account data, a placement as its cell id', async () => {
		const backing = controlledStorage();
		const accountData = createAccountData({
			accountStore: accountStore(ALICE),
			deployments,
			clock,
			scopeAddress: SCOPE,
			storageAdapter: backing.adapter,
			fields: SUBMISSION_FIELDS,
		});
		const stop = accountData.subscribe(() => {});
		try {
			const storage = createSubmissionStorage({
				accountData,
				chainId: 31337,
				contract: '0x00000000000000000000000000000000000000Ga' as never,
				// `as never`: an identity is an address here and a token id on
				// `with/nft-identity`, and the key is the same template either way.
				player: '0xPlayer' as never,
			});
			await vi.waitFor(() => expect(get(storage.ready)).toBe(true));
			await storage.saveDurably({
				cycleNumber: 3,
				actions: [{cellID: 12n}],
				secret: SECRET,
				committed: true,
				commitmentHash: `0x${'cd'.repeat(24)}`,
			});

			const stored = backing.saved.get(storageKey(ALICE)) as {
				data: {
					submissions: Record<string, unknown>;
					committedTurns: Record<string, unknown>;
				};
			};
			const key = '31337_0x00000000000000000000000000000000000000ga_0xplayer';
			const written = {
				cycleNumber: 3,
				actions: ['12'],
				secret: SECRET,
				committed: true,
				commitmentHash: `0x${'cd'.repeat(24)}`,
			};
			expect(stored.data.submissions[key]).toMatchObject({turn: written});
			expect(
				stored.data.committedTurns[`${key}_3_0x${'cd'.repeat(24)}`],
			).toMatchObject(written);
		} finally {
			stop();
		}
	});
});

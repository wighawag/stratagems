import {describe, expect, it} from 'vitest';
import {keccak256} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createDerivedSecret, playedSeatSecret} from '$lib/game/core/secret';

const CONTRACT = '0x1234567890AbcdEF1234567890aBcdef12345678' as const;

/** Records what it was asked to sign, and answers deterministically. */
function recordingSigner() {
	const messages: string[] = [];
	const sign = async (message: string) => {
		messages.push(message);
		return keccak256(new TextEncoder().encode(message));
	};
	return {sign, messages};
}

describe('a derived commit secret', () => {
	it('names the chain, the contract, the identity and the cycle', async () => {
		const {sign, messages} = recordingSigner();
		const makeSecret = createDerivedSecret({
			sign,
			chainId: 31337,
			contract: CONTRACT,
		});

		await makeSecret({cycleNumber: 7, identity: 42n});

		expect(messages).toEqual([
			`Commit:31337:0x1234567890abcdef1234567890abcdef12345678:42:7`,
		]);
	});

	it('is REPRODUCIBLE, which is the entire point', async () => {
		// The failure this defends against is a player who clears site data
		// between the commit and the reveal. The secret has to come back from the
		// key alone, so two independent calls must agree.
		const a = createDerivedSecret({
			sign: recordingSigner().sign,
			chainId: 31337,
			contract: CONTRACT,
		});
		const b = createDerivedSecret({
			sign: recordingSigner().sign,
			chainId: 31337,
			contract: CONTRACT,
		});

		expect(await a({cycleNumber: 7, identity: 42n})).toBe(
			await b({cycleNumber: 7, identity: 42n}),
		);
	});

	it('differs for every axis of the message, including the IDENTITY', async () => {
		// The identity is the one that was missing from the games this was taken
		// from, and it is the one that matters where an account holds several: a
		// shared secret lets one of them open another's commitment by enumerating
		// a small action space against the published hash.
		const {sign} = recordingSigner();
		const base = {chainId: 31337, contract: CONTRACT};
		const makeSecret = createDerivedSecret({sign, ...base});

		const secret = await makeSecret({cycleNumber: 7, identity: 42n});

		expect(await makeSecret({cycleNumber: 8, identity: 42n})).not.toBe(secret);
		expect(await makeSecret({cycleNumber: 7, identity: 43n})).not.toBe(secret);
		expect(
			await createDerivedSecret({sign, ...base, chainId: 1})({
				cycleNumber: 7,
				identity: 42n,
			}),
		).not.toBe(secret);
		expect(
			await createDerivedSecret({
				sign,
				chainId: 31337,
				contract: '0x0000000000000000000000000000000000000001',
			})({cycleNumber: 7, identity: 42n}),
		).not.toBe(secret);
	});

	it('spells a checksummed and a lowercased address the same way', async () => {
		// Both spellings are the same address and different TEXT, and both are in
		// circulation in deployment files. Getting this wrong throws nothing: it
		// produces a commitment the player cannot open, and they find out when the
		// reveal window shuts on their stake.
		const {sign, messages} = recordingSigner();
		const checksummed = createDerivedSecret({
			sign,
			chainId: 31337,
			contract: CONTRACT,
		});
		const lowercased = createDerivedSecret({
			sign,
			chainId: 31337,
			contract: CONTRACT.toLowerCase() as `0x${string}`,
		});

		expect(await checksummed({cycleNumber: 3, identity: 1n})).toBe(
			await lowercased({cycleNumber: 3, identity: 1n}),
		);
		expect(messages[0]).toBe(messages[1]);
	});

	it('spells an ADDRESS identity canonically too', async () => {
		// The template's own game is address-keyed, so this is not a hypothetical
		// second case: it is the case that ships here.
		const {sign, messages} = recordingSigner();
		const makeSecret = createDerivedSecret<`0x${string}`>({
			sign,
			chainId: 31337,
			contract: CONTRACT,
		});

		await makeSecret({
			cycleNumber: 1,
			identity: '0xAAbBCcDdEeFf00112233445566778899aabbccdd',
		});

		expect(messages[0]).toBe(
			'Commit:31337:0x1234567890abcdef1234567890abcdef12345678:0xaabbccddeeff00112233445566778899aabbccdd:1',
		);
	});

	it('produces 32 bytes from a 65-byte signature', async () => {
		// The commitment wants 32 bytes, and hashing also means the secret is not
		// itself a valid signature over anything if it leaks.
		const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
		const makeSecret = createDerivedSecret({
			sign: (message) => account.signMessage({message}),
			chainId: 31337,
			contract: CONTRACT,
		});

		const secret = await makeSecret({cycleNumber: 2, identity: 5n});

		expect(secret).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it('recomputes the same secret from a real key on a "second device"', async () => {
		// The whole feature, end to end: the same key, constructed twice with
		// nothing shared between them, agrees. This is what makes clearing local
		// storage survivable.
		const privateKey = `0x${'22'.repeat(32)}` as const;
		const onePlace = createDerivedSecret({
			sign: (m) => privateKeyToAccount(privateKey).signMessage({message: m}),
			chainId: 31337,
			contract: CONTRACT,
		});
		const another = createDerivedSecret({
			sign: (m) => privateKeyToAccount(privateKey).signMessage({message: m}),
			chainId: 31337,
			contract: CONTRACT,
		});

		expect(await onePlace({cycleNumber: 9, identity: 1n})).toBe(
			await another({cycleNumber: 9, identity: 1n}),
		);
	});
});

describe('the secret a played seat commits with', () => {
	const base = {chainId: 1, contract: CONTRACT, identity: 1n, cycleNumber: 2};

	it('is reproducible, which is the only reason a reload can reveal', () => {
		// THE LOAD-BEARING PROPERTY, and the only one. A seat that commits and
		// then cannot reproduce its secret freezes a manual cycle for everybody:
		// no advance closes a cycle holding an unopened commitment, and a missed
		// reveal from the CURRENT cycle cannot be settled either, so the two
		// refusals become each other's premise.
		expect(playedSeatSecret(base)).toBe(playedSeatSecret(base));
	});

	it('is separated by chain, contract, identity and cycle', () => {
		// Two seats deriving ONE secret would be two commitments either of them
		// could open, which is a way for one played seat to settle another's turn
		// by accident. The other three axes are the ordinary ones: the same cycle
		// of the same game on another chain, or another deployment on the same
		// chain, is a different cycle.
		expect(playedSeatSecret({...base, chainId: 2})).not.toBe(
			playedSeatSecret(base),
		);
		expect(playedSeatSecret({...base, identity: 2n})).not.toBe(
			playedSeatSecret(base),
		);
		expect(playedSeatSecret({...base, cycleNumber: 3})).not.toBe(
			playedSeatSecret(base),
		);
		expect(
			playedSeatSecret({
				...base,
				contract: '0x2222222222222222222222222222222222222222',
			}),
		).not.toBe(playedSeatSecret(base));
	});

	it('is 32 bytes, which is what a commitment takes', async () => {
		// The same width as the player's own secret above, and as the framework's
		// random default. A derivation that produced anything else would be caught
		// by the contract rather than here, one phase after the commit.
		const played = playedSeatSecret(base);
		expect(played).toMatch(/^0x[0-9a-f]{64}$/);

		const own = createDerivedSecret({
			sign: (m) =>
				privateKeyToAccount(`0x${'22'.repeat(32)}`).signMessage({message: m}),
			chainId: base.chainId,
			contract: base.contract,
		});
		// AND IT IS NOT THE PLAYER'S OWN SECRET FOR THE SAME CYCLE. Nothing would
		// break if they collided - the two identities differ - but a reader is
		// entitled to know the two derivations are separate things.
		expect(played).not.toBe(
			await own({cycleNumber: base.cycleNumber, identity: base.identity}),
		);
	});
});

import {bls12_381} from '@noble/curves/bls12-381';
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';
import type {HttpChainClient} from 'tlock-js';

/**
 * An offline drand network for tests, taken from fuzd's own
 * (`packages/client/test/utils/fake-drand.ts`): a BLS key made up here, on the
 * unchained scheme tlock-js supports with the public key on G1 and signatures
 * on G2 (`pedersen-bls-unchained`). A round's beacon is the signature of
 * sha256(round as 8 bytes big-endian), which is the key tlock-js uses to
 * decrypt what was encrypted for that round. Nothing reaches the network.
 */
export function createFakeDrand(): HttpChainClient {
	const secretKey = bls12_381.utils.randomPrivateKey();
	const info = {
		public_key: bytesToHex(bls12_381.getPublicKey(secretKey)),
		period: 3,
		genesis_time: Math.floor(Date.now() / 1000) - 3 * 1000,
		hash: '00'.repeat(32),
		groupHash: '00'.repeat(32),
		schemeID: 'pedersen-bls-unchained',
		metadata: {beaconID: 'with-fuzd-test'},
	};
	function roundId(round: number): Uint8Array {
		const bytes = new Uint8Array(8);
		new DataView(bytes.buffer).setBigUint64(0, BigInt(round));
		return sha256(bytes);
	}
	const client = {
		options: {
			disableBeaconVerification: true,
			noCache: true,
			chainVerificationParams: undefined,
		},
		chain: () => ({baseUrl: 'fake-drand', info: async () => info}),
		async get(round: number) {
			return {
				round,
				signature: bytesToHex(bls12_381.sign(roundId(round), secretKey)),
			};
		},
		async latest() {
			throw new Error('fake drand: latest() is not served');
		},
	};
	return client as unknown as HttpChainClient;
}

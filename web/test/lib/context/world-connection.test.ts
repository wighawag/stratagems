import {describe, it, expect} from 'vitest';
import {createContext} from '$lib/context/index';
import type {ConnectionFactory, ConnectionRequest} from '$lib/context/index';
import {establishRemoteConnection} from '$lib/core/connection';
import type {EstablishedConnection} from '$lib/core/connection/types';
import {resolveConnectionConfig, TARGET_STEP} from '$lib/core/connection/mode';
import {PUBLIC_WALLET_HOST} from '$env/static/public';
import {writable} from 'svelte/store';
import {deployments as buildTimeDeployments} from '$lib/deployments-store';
import {delegationRegistryAddress} from '$lib/context/config';
import type {DeploymentsStore, TypedDeployments} from '$lib/deployments-store';

// No `.svelte.` infix, so this runs in the `server` project: Node, no DOM. That
// is deliberate and not merely inherited from the SSR test next door - the
// context is constructible off-browser (ADR-0002), so the cheapest place to
// assert how it is WIRED is the environment that needs no browser at all.
//
// WHAT THIS PINS, and why it is worth a file: `establishRemoteConnection` used
// to be called from inside `buildConnection`, so which world the context
// described was a fact about core.ts rather than something a caller could say.
// Making it a parameter is only half the change; the other half is that nothing
// inside core reaches for the remote one behind the parameter's back, and that
// half is invisible to every other test, because with one world the two produce
// the same context.
describe('the context describes the world it is given', () => {
	it('is handed this app\u2019s authentication, not a world\u2019s idea of it', () => {
		const requests: ConnectionRequest[] = [];
		const establishConnection: ConnectionFactory = (request) => {
			requests.push(request);
			return establishRemoteConnection(request);
		};

		createContext({establishConnection});

		// Exactly one. A second call would mean two worlds' worth of connection
		// for one context, which is the shape this seam exists to make impossible
		// by accident: a world gets a CONTEXT, so a context gets one world.
		expect(requests.length).toBe(1);

		// The request is the app's own configuration, resolved the one way it is
		// ever resolved. A world chooses the chain; it does not get to decide
		// whether this app has a local signer, because that is what TARGET_STEP is
		// for and it must not fork per world.
		const expected = resolveConnectionConfig(TARGET_STEP, PUBLIC_WALLET_HOST);
		expect(requests[0].targetStep).toBe(expected.targetStep);
		expect(requests[0].walletHost).toBe(expected.walletHost);
		expect(requests[0].walletOnly).toBe(expected.walletOnly);
	});

	it('uses what the factory returned, member for member', () => {
		let established: EstablishedConnection | undefined;
		const establishConnection: ConnectionFactory = (request) => {
			established = establishRemoteConnection(request);
			return established;
		};

		const {context} = createContext({establishConnection});

		// Identity, not equivalence. Everything below is world-scoped, and a core
		// that quietly built its own would produce a context that behaves
		// identically today and points at the wrong chain the moment there are
		// two. `deployments` is the sharpest of the four: a second world has its
		// own contracts at its own addresses.
		expect(established).toBeDefined();
		expect(context.connection).toBe(established!.connection);
		expect(context.publicClient).toBe(established!.publicClient);
		expect(context.deployments).toBe(established!.deployments);
		expect(context.forceRpcFailure).toBe(established!.forceRpcFailure);
	});

	it('defaults to the remote world when nobody names one', () => {
		// The parameter is optional on purpose: an app with one world says
		// nothing, and every route in this repo takes this path. If the default
		// ever stopped being wired, `createContext()` would throw here rather than
		// failing in a browser.
		const {context} = createContext();
		expect(context.connection).toBeDefined();
		expect(context.deployments).toBeDefined();
	});

	// THE DELEGATION PAIR IS THE WORLD'S. Measured in stratagems (2026-10-30,
	// its plan's step D): an offline world whose contracts sat one nonce off the
	// build's had its browser key registered at the BUILD's address, so the
	// world's game refused every move with `NotDelegate`, while the UI said the
	// key was authorised (the read was scoped to the same wrong address). The
	// e2e never saw it because its build is the same deploy sequence as the
	// world's. Every published build is not: its deployment is a live chain's.
	it('reads and writes delegation at the world\u2019s contract, on the world\u2019s chain', () => {
		const app = buildTimeDeployments.get();
		const appRegistry = delegationRegistryAddress(app);
		const elsewhere = '0x00000000000000000000000000000000000d1e60' as const;
		const world = {
			...app,
			chain: {...app.chain, id: app.chain.id + 1},
			contracts: Object.fromEntries(
				Object.entries(app.contracts).map(([name, record]) => [
					name,
					(record as {address: string}).address.toLowerCase() ===
					appRegistry.toLowerCase()
						? {...(record as object), address: elsewhere}
						: record,
				]),
			),
		} as unknown as TypedDeployments;
		const store = writable(world);
		const worldDeployments: DeploymentsStore = {
			subscribe: store.subscribe,
			get: () => world,
		};
		const establishConnection: ConnectionFactory = (request) => ({
			...establishRemoteConnection(request),
			deployments: worldDeployments,
		});

		const {context} = createContext({establishConnection});

		expect(delegationRegistryAddress(world)).toBe(elsewhere);
		expect(context.delegation.registry.address).toBe(elsewhere);
		expect(context.delegation.registry.chainId).toBe(app.chain.id + 1);
	});
});

import type {EmbeddedWorld} from '$lib/embedded';
import type {EmbeddedWallet} from '$lib/embedded/wallet';
import type {DeploymentsStore} from '$lib/deployments-store';
import type {Context} from '$lib/context/types';
import {connectTheWorld} from '$lib/offline-world';
import {authoriseTheBrowsersKey} from '$lib/ui/delegation/authorise-here';
import {
	createLocalRevealer,
	type LocalRevealer,
} from '$lib/game/core/local-revealer';
import {
	createHotseat,
	createHotseatChainReader,
	signInAs,
	signedInAs,
	type Hotseat,
	type HotseatHuman,
} from '$lib/game/lobby/hotseat';
import {localRevealerKey} from '$lib/game/lobby/seats';
import {worldChain} from './chain';

/** A person at this device: their seat, and their account's index in the world's wallet. */
export type HumanHere = {seat: number; account: number};

function gameOf(records: DeploymentsStore) {
	const {address, abi} = records.get().contracts.Game;
	return {address, abi};
}

/**
 * WHO REVEALS FOR THE PEOPLE AT THIS DEVICE, when there are several of them
 * (hotseat): a local revealer with its own funded key (the world's wallet
 * funds it, `createOfflineWallet`), handed each turn at its commit through the
 * scheduler seam, so nobody takes the device back to reveal. The context hands
 * it to the game in place of any scheduler of the game's own. One person needs
 * none: they reveal themselves. Undefined then.
 *
 * Built BEFORE the context, which takes its scheduler.
 */
export function revealerForTheHumans(params: {
	world: Pick<EmbeddedWorld, 'provider' | 'deployments'>;
	records: DeploymentsStore;
	humans: readonly HumanHere[];
	/** After the revealer sent something: a reveal may complete the cycle. */
	onActed: () => void;
}): LocalRevealer | undefined {
	if (params.humans.length < 2) return undefined;
	return createLocalRevealer({
		provider: params.world.provider as never,
		chain: worldChain(params.world),
		privateKey: localRevealerKey().privateKey,
		contract: gameOf(params.records) as never,
		onActed: params.onActed,
	});
}

/**
 * Authorise the signed-in person's browser key, once the context has caught up
 * with the account switch: right after one, the account's executor can still
 * be getting ready, which `authoriseTheBrowsersKey` answers with a refusal
 * rather than a wait.
 */
async function authoriseWhenReady(context: Context): Promise<void> {
	for (let attempt = 0; attempt < 40; attempt++) {
		const outcome = await authoriseTheBrowsersKey(context);
		if (outcome.step !== 'Refused') return;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}
	throw new Error("the browser's key could not be authorised");
}

/**
 * THE PEOPLE AT THIS DEVICE, SEATED: the world connects its own wallet, signs
 * in when the app does, and authorises the key each person's browser plays
 * with, so nobody meets a dialog with one possible answer in front of a game
 * that is otherwise ready.
 *
 * AND IT CONNECTS ITSELF, which an online world may not do and is the only
 * honest behaviour here (`connectTheWorld`, `$lib/offline-world`): a world that
 * brought its own wallet has already answered which wallet, which account and
 * whether this site may see it. NOT FATAL IF IT FAILS: the world, the chain and
 * the deploy are all fine without a connection; what the player loses is the
 * ability to send, and the game already says so through its setup gate.
 *
 * AND IT AUTHORISES THE KEY THIS BROWSER PLAYS WITH, which is the last thing
 * standing between a player and the board. HERE rather than in provisioning:
 * the signer is derived in the tab from the SIGNATURE the sign-in asks for, so
 * at provisioning time it does not exist and has no address to register. NOT
 * FATAL: if it fails the game's setup gate comes back with the button on it,
 * which is the remedy a player would have had anyway.
 *
 * SEVERAL PEOPLE HERE (hotseat), one after another, ending on the first: each
 * signs in (the world asks for the signature) and has their own browser key
 * authorised, now rather than at their first handover, so no turn opens on a
 * transaction. `authoriseTheBrowsersKey` answers `AlreadyAuthorised` on a
 * restore. Answers who they are, for the handover
 * ({@link handOverBetweenThem}); nobody when one person is here.
 *
 * `identityOf` is the game's: who an account plays as at this game.
 */
export async function seatTheHumans(params: {
	context: Context;
	wallet: EmbeddedWallet | undefined;
	humans: readonly HumanHere[];
	identityOf: (address: `0x${string}`) => bigint | Promise<bigint>;
	onStep?: (what: string) => void;
}): Promise<HotseatHuman[]> {
	const {context, wallet, humans, onStep} = params;
	onStep?.('connecting');
	try {
		await connectTheWorld(context.connection);
	} catch (err) {
		console.error('the offline world could not connect its own wallet', err);
	}

	onStep?.("authorising this browser's key");
	const seated: HotseatHuman[] = [];
	if (humans.length > 1 && wallet) {
		for (const human of humans) {
			const address = wallet.accounts[human.account];
			seated.push({
				address,
				player: await params.identityOf(address),
				label: `Player ${human.account + 1}`,
			});
			onStep?.(`authorising Player ${human.account + 1}'s key`);
			try {
				await signInAs({
					connection: context.connection,
					select: wallet.select,
					address,
				});
				await authoriseWhenReady(context);
			} catch (err) {
				console.error(
					`the offline world could not authorise Player ${human.account + 1}'s key`,
					err,
				);
			}
		}
		try {
			await signInAs({
				connection: context.connection,
				select: wallet.select,
				address: seated[0].address,
			});
		} catch (err) {
			console.error('the offline world could not sign in as Player 1', err);
		}
		return seated;
	}
	try {
		await authoriseTheBrowsersKey(context);
	} catch (err) {
		console.error(
			"the offline world could not authorise this browser's key",
			err,
		);
	}
	return seated;
}

/**
 * THE HANDOVER, when there are several people here: whose turn it is, read
 * from the chain, and the screen that covers the game while the device
 * changes hands. See `$lib/game/lobby/hotseat`. Undefined with one person, or
 * without the wallet or the revealer a handover needs.
 */
export function handOverBetweenThem(params: {
	seated: readonly HotseatHuman[];
	wallet: EmbeddedWallet | undefined;
	revealer: LocalRevealer | undefined;
	context: Context;
	world: Pick<EmbeddedWorld, 'provider' | 'deployments'>;
	records: DeploymentsStore;
}): Hotseat | undefined {
	const {seated, wallet, revealer, context} = params;
	if (seated.length < 2 || !wallet || !revealer) return undefined;
	return createHotseat({
		humans: seated,
		switchTo: (address) =>
			signInAs({
				connection: context.connection,
				select: wallet.select,
				address,
			}),
		read: createHotseatChainReader({
			provider: params.world.provider as never,
			chain: worldChain(params.world),
			contract: gameOf(params.records) as never,
			players: seated.map((human) => human.player),
		}),
		revealer,
		submission: context.game.submission,
		signedIn: signedInAs(context.connection),
		accountData: context.accountData,
	});
}

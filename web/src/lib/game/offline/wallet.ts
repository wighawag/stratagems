import {
	announceEmbeddedWallet,
	type EmbeddedWallet,
} from '$lib/embedded/wallet';
import {
	humansAtThisDevice,
	localRevealerKey,
	seatsPlayedByTheWorld,
	type Table,
} from '$lib/game/lobby/seats';

/** The world's node, as provisioning is handed it. */
export type WorldNodeProvider = {request: (args: never) => Promise<unknown>};

/** Set an account's balance on the world's chain: its ether is a number. */
export async function giveGas(
	provider: WorldNodeProvider,
	address: `0x${string}`,
	amount: bigint,
): Promise<void> {
	await provider.request({
		method: 'evm_setBalance',
		params: [address, `0x${amount.toString(16)}`],
	} as never);
}

export type OfflineWallet = {
	/**
	 * Announce the world's wallet, one account per person at this device in seat
	 * order, and give gas to everyone the world provisions: the wallet's
	 * accounts, every seat the world plays and, when several people share the
	 * device, the local revealer that pays for their reveals.
	 */
	announce(params: {
		provider: WorldNodeProvider;
		chainId: number;
		table: Table;
		gas: bigint;
	}): Promise<EmbeddedWallet>;
	/** The wallet announced last, if any: the world switches its accounts in hotseat. */
	current(): EmbeddedWallet | undefined;
	/**
	 * Stop announcing it. NOT a teardown of the world, deliberately: the chain
	 * outlives the page that showed it, and disposing of it on unmount is how a
	 * router deletes somebody's game.
	 */
	stop(): void;
};

/** How a world's wallet is announced: the mechanism's, or a game's own around it. */
export type AnnounceWallet = (params: {
	provider: never;
	chainId: number;
	accounts: number;
}) => Promise<EmbeddedWallet>;

/**
 * THE WORLD'S OWN WALLET, and the gas every seat of its table plays with.
 *
 * The first half of what a world gives its players, and the half that is the
 * same in every game: a wallet the world brings (so the player is never asked
 * to pick one, and cannot pick one that has no account on this chain) and gas
 * by cheat call. What a seat is STAKED with is the game's, and comes after.
 *
 * GAS IS FREE HERE AND THE STAKE IS NOT, which is the one asymmetry between
 * this and a game's stake, and it is deliberate. Provisioning runs on EVERY
 * boot, including a restore, so a balance set unconditionally is a refill on
 * every reload, and that is the right answer for gas, which is a number on a
 * chain in a tab and is not what anybody is risking. A stake is the opposite
 * case: topping it up on reload would make a missed reveal cost nothing, so a
 * game asks the chain before staking.
 *
 * GAS FOR EVERY SEAT THE WORLD PLAYS, on the same terms and for the same
 * reason: a player who cannot pay for a commit freezes the cycle for the human
 * rather than for itself.
 *
 * `announce` is the mechanism's (`announceEmbeddedWallet`) unless the game
 * names its own: a world that must give the same accounts every time (a demo
 * preset of infinite-gambit's, by a fixed mnemonic) announces its own way, and
 * every seat is still given its gas here.
 */
export function createOfflineWallet(
	options: {announce?: AnnounceWallet} = {},
): OfflineWallet {
	const announceWallet: AnnounceWallet =
		options.announce ?? ((params) => announceEmbeddedWallet(params));
	let wallet: EmbeddedWallet | undefined;
	return {
		async announce(params) {
			const humans = humansAtThisDevice(params.table);
			const announced = await announceWallet({
				provider: params.provider as never,
				chainId: params.chainId,
				// One account per person at this device (hotseat), in seat order.
				accounts: humans.length,
			});
			wallet = announced;
			// The revealer of a hotseat world pays for everyone's reveals.
			if (humans.length > 1) {
				await giveGas(params.provider, localRevealerKey().address, params.gas);
			}
			for (const account of announced.accounts) {
				await giveGas(params.provider, account, params.gas);
			}
			for (const played of seatsPlayedByTheWorld(params.table)) {
				await giveGas(params.provider, played.address, params.gas);
			}
			return announced;
		},
		current: () => wallet,
		stop() {
			wallet?.cleanup();
			wallet = undefined;
		},
	};
}

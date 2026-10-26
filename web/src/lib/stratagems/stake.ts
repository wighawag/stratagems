/**
 * What stratagems puts at stake, how a player gets it, and the words for it.
 *
 * GEMS IN THE RESERVE: a commitment bonds them, a missed reveal forfeits them
 * (one gem per committed move when the chunks are shown, the whole bond when
 * not), and each placement puts one on its cell. The reserve is the base's
 * (`$lib/game/core/commit-reveal/reserve`); the stake is acquired through the
 * template's rail (`$lib/game/acquire`) with `addToReserveAndFund`.
 *
 * ONE TRANSACTION, as the template's: `addToReserveAndFund` moves the gems from
 * the paying wallet into the player's reserve AND forwards the stipend to the
 * key this browser plays with, which then registers itself out of it (the
 * template's `StakeSale.purchase` does the same for its game). The deploy gives
 * the game a global approval on TestTokens, so no `approve` precedes it.
 *
 * ONE DIFFERENCE FROM THE TEMPLATE'S: the payer must already hold gems. The
 * template's sale mints them for a price; here they come from the wallet, and
 * getting gems in the first place is the TestTokens claim, step 6c's.
 */
import type {Abi} from 'viem';
import {formatUnits, zeroAddress} from 'viem';
import type {TypedDeployments} from '$lib/core/connection/types';
import {acquisitionTotal, type Acquisition} from '$lib/game/acquire';
import {onchainIdentity} from '$lib/game/identity';
import type {StratagemsConfig} from './game-config';

/** Gas to keep back when asking whether a payer can afford the deposit. */
const DEPOSIT_GAS = 200_000n;

export function createStakeAcquisition(params: {
	config: StratagemsConfig;
	deployments: TypedDeployments;
}): Acquisition {
	const {config, deployments} = params;
	const Stratagems = deployments.contracts.Stratagems;
	return {
		address: Stratagems.address,
		functionName: 'addToReserveAndFund',
		price: 0n,
		stipend: config.stipend,
		gas: DEPOSIT_GAS,
		// `stipendTo` and `stipend` move together (the rail's `stipendFor`): with
		// no key to register, nothing is sent and the contract forwards nothing.
		request: ({owner, stipendTo, stipend}) => ({
			abi: Stratagems.abi as Abi,
			args: [
				onchainIdentity(owner),
				config.stakeAmount,
				stipendTo ?? zeroAddress,
			],
			value: acquisitionTotal({price: 0n, stipend}),
		}),
	};
}

/**
 * What this game needs at stake before a first move: a reserve to bond from.
 * `Unloaded` is not "no stake", or the gate would cover a playable board on
 * every load until the read lands.
 */
export function stakeNeeded(reserve: {
	step: string;
	amount?: bigint;
}): {step: 'stake'} | undefined {
	return reserve.step === 'Loaded' && reserve.amount === 0n
		? {step: 'stake'}
		: undefined;
}

/**
 * The stake's vocabulary, for the HUD. `native` is the chain's currency,
 * in which the stipend is paid: the button states everything the wallet is
 * about to be asked for, gems AND gas, since one that understates the charge is
 * worse than one with no number on it.
 */
export function stakeWords(
	config: StratagemsConfig,
	native: {symbol: string; decimals: number},
) {
	const amount = (value: bigint): string =>
		`${formatUnits(value, config.currency.decimals)} gems`;
	return {
		amount,

		notEnough: 'Not enough in your reserve to bond this turn.',

		setup: {
			headline: 'Stake gems before you play',
			detail:
				'A commitment bonds gems from your reserve, and they are forfeit if you never reveal: that is what makes a commitment worth anything. One transaction moves gems from your wallet into a reserve in your name, which only you can withdraw, and funds the key this browser plays with.',
			action(): string {
				return config.stipend > 0n
					? `Stake ${amount(config.stakeAmount)} + ${formatUnits(config.stipend, native.decimals)} ${native.symbol} of gas`
					: `Stake ${amount(config.stakeAmount)}`;
			},
		},

		forfeited(forfeit: bigint): string {
			return `${amount(forfeit)} of your bond is forfeit, and you cannot commit again until you acknowledge it.`;
		},

		acquireExplanation:
			'One transaction moves gems into your reserve and funds the key this browser plays with. Whoever pays, the reserve belongs to your account, and only your account can ever withdraw it.',
	};
}

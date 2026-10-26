/**
 * What stratagems puts at stake, how a player gets it, and the words for it.
 *
 * GEMS IN THE RESERVE: a commitment bonds them, a missed reveal forfeits them
 * (one gem per committed move when the chunks are shown, the whole bond when
 * not), and each placement puts one on its cell. The reserve is the base's
 * (`$lib/game/core/commit-reveal/reserve`); the stake is acquired through the
 * template's rail (`$lib/game/acquire`) with `addToReserve`, from the wallet.
 *
 * TWO DIFFERENCES FROM THE TEMPLATE'S ONE-TRANSACTION STAKE, both stated here
 * because the rail cannot see them:
 *
 * - The player must already hold gems: `addToReserve` moves them from the wallet
 *   (the deploy gives the game a global approval on TestTokens, so no `approve`
 *   precedes it). Getting gems in the first place is the TestTokens claim, step
 *   6c's.
 * - `addToReserve` is not payable, so nothing is forwarded to the browser's key:
 *   the stipend is zero, the key's self-registration that would follow finds no
 *   gas, and the setup gate then asks to authorise, which the framework's top-up
 *   flow does in one more transaction. A payable deposit that forwards a stipend
 *   would make it one; that is a contract change, for the deployment step.
 */
import type {Abi} from 'viem';
import {formatUnits} from 'viem';
import type {TypedDeployments} from '$lib/core/connection/types';
import type {Acquisition} from '$lib/game/acquire';
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
		functionName: 'addToReserve',
		price: 0n,
		// nothing can be forwarded: see the header
		stipend: 0n,
		gas: DEPOSIT_GAS,
		request: ({owner}) => ({
			abi: Stratagems.abi as Abi,
			args: [onchainIdentity(owner), config.stakeAmount],
			value: 0n,
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

/** The stake's vocabulary, for the HUD. */
export function stakeWords(config: StratagemsConfig) {
	const amount = (value: bigint): string =>
		`${formatUnits(value, config.currency.decimals)} gems`;
	return {
		amount,

		notEnough: 'Not enough in your reserve to bond this turn.',

		setup: {
			headline: 'Stake gems before you play',
			detail:
				'A commitment bonds gems from your reserve, and they are forfeit if you never reveal: that is what makes a commitment worth anything. Staking moves gems from your wallet into a reserve in your name, which only you can withdraw.',
			action(): string {
				return `Stake ${amount(config.stakeAmount)}`;
			},
		},

		forfeited(forfeit: bigint): string {
			return `${amount(forfeit)} of your bond is forfeit, and you cannot commit again until you acknowledge it.`;
		},

		acquireExplanation:
			'Moves gems from your wallet into your reserve. Whoever pays the gas, the reserve belongs to your account, and only your account can ever withdraw it.',
	};
}

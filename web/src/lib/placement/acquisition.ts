/**
 * What this game acquires, and how: the seam the acquisition rail plugs into.
 *
 * The template gates on a token reserve bonded at commit time and forfeited by
 * a missed reveal's settlement, so what a new player has to get is a stake. That
 * used to be three transactions they were never told about - mint, approve,
 * add to the reserve - each signed in the wallet, with nothing on screen saying
 * why there were three. `StakeSale.purchase` is one call that does all of it
 * AND funds the local signer's gas in the same transaction, which is what lets
 * the rail above this file be one transaction end to end.
 *
 * A game that gates differently (custody of an item the player bought, a pass)
 * replaces this file and nothing else: the rail takes the address, the function
 * name, the price, the stipend and the arguments, and has no opinion about what
 * arrives.
 */
import type {Abi} from 'viem';
import type {TypedDeployments} from '$lib/core/connection/types';
import {acquisitionTotal, type Acquisition} from '$lib/game/acquire';
import type {PlacementConfig} from './config';

/**
 * Gas to keep back when asking whether a payer can afford the purchase.
 *
 * A contract call with a value transfer plus an ERC20 mint and a reserve
 * credit, generously rounded: being short here offers a payer who then fails in
 * the wallet, while being generous only sends someone to the other payment
 * method a little early.
 */
const PURCHASE_GAS = 400_000n;

export function createStakeAcquisition(params: {
	config: PlacementConfig;
	deployments: TypedDeployments;
}): Acquisition {
	const {config, deployments} = params;
	return {
		address: config.sale.address,
		functionName: 'purchase',
		price: config.sale.price,
		stipend: config.sale.stipend,
		gas: PURCHASE_GAS,
		request: ({owner, stipendTo, stipend}) => ({
			abi: deployments.contracts.StakeSale.abi as Abi,
			// `player` first, then where the gas goes and how much of the value it
			// is. The player is an ARGUMENT rather than `msg.sender` on purpose:
			// that is what lets a wallet pay for an account that has none of its
			// own, and topping up somebody else's reserve is a gift, because only
			// its owner can ever withdraw it.
			args: [
				owner,
				// The contract refuses a stipend with nowhere to go rather than
				// keeping it, so these two have to move together.
				stipendTo ?? '0x0000000000000000000000000000000000000000',
				stipend,
			],
			// The whole value, not the price. The sale subtracts the stipend from
			// `msg.value` and then requires the remainder to equal the price
			// EXACTLY, so the two have to be computed together or the purchase
			// reverts with `WrongPaymentAmount`.
			value: acquisitionTotal({price: config.sale.price, stipend}),
		}),
	};
}

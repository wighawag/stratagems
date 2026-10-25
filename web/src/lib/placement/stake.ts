/**
 * WHAT THIS GAME PUTS AT STAKE, in the words a player reads.
 *
 * `./reserve.ts` is what the stake IS; this is what it is CALLED. They are
 * separate files because the second one has consumers the first must not
 * acquire: the HUD model and the play route both describe the stake, and a
 * store that imported a formatter to satisfy them would be carrying UI copy
 * for the sake of two callers.
 *
 * WHY IT IS ONE MODULE RATHER THAN LITERALS AT THE SITES THAT NEED THEM.
 * `with/nft-identity` changes what is at stake - custody of a token instead of
 * a bonded reserve - and every sentence here is one it has to rewrite. Left in
 * place, those sentences would put `placement/ui/hud.ts` (523 lines, developed
 * every time the HUD gains a state) and `routes/play/+page.svelte` (a route,
 * and one that `with/pixi-js` depends on being byte-identical) on that
 * branch's shared-file list forever, to hold about six strings. Here they are
 * a file that exists in order to differ, which is the difference between a
 * conflict site and a switch. Rules N1 and N2 of Decision 3, in the plan on
 * the `work` branch.
 *
 * The test of whether something belongs here: would a game that gates
 * differently have to change the WORDS? If it would only change the number, it
 * is a formatter and belongs where it is.
 */
import {formatBalance} from '$lib/core/utils/format/balance';

export const STAKE = {
	/**
	 * An amount of the stake, as a player reads it.
	 *
	 * The unit is part of it rather than a separate constant, because a game
	 * whose stake is a THING rather than a quantity has no unit and needs a
	 * different sentence, not a different word.
	 */
	amount(value: bigint): string {
		return `${formatBalance(value)} TOK`;
	},

	/** The plan costs more than the stake can cover. */
	notEnough: 'Not enough in your reserve to cover these placements.',

	/**
	 * The setup gate's stake step.
	 *
	 * Says what the ONE transaction covers, because the player is about to
	 * approve something that does three things: it puts tokens in a reserve only
	 * they can withdraw, it sends this browser's key enough gas to play with,
	 * and it is what lets that key be authorised without a second transaction.
	 * Saying only "stake" would make the wallet prompt look bigger than the
	 * price.
	 */
	setup: {
		headline: 'Stake before you play',
		detail:
			'A commitment bonds tokens from your reserve, and they are forfeit if you never reveal. That is what makes a commitment worth anything. One transaction sets you up: it puts a reserve in your name, which only you can withdraw, and funds the key this browser plays with.',
		/** The button, with the total the wallet is about to ask for. */
		action(priceLabel?: string): string {
			return priceLabel ? `Stake for ${priceLabel}` : 'Stake to play';
		},
	},

	/**
	 * What a missed reveal cost, and what to do next.
	 *
	 * The number is only half of it: what was LOST is a fact about the stake, so
	 * a game that seizes a thing rather than a quantity says a different
	 * sentence rather than the same sentence about a different number. The
	 * second clause is the framework's rule showing through - an unrevealed
	 * commitment blocks the next one until it is settled - and every game has
	 * it.
	 *
	 * The amount is what SETTLING will take, which is less than the bond when
	 * this browser still has the turn's chunks: shown them, the contract keeps
	 * only what the placements would have cost and returns the rest.
	 */
	forfeited(forfeit: bigint): string {
		return `${this.amount(forfeit)} of your bond is forfeit, and you cannot commit again until you acknowledge it.`;
	},

	/**
	 * What the acquisition dialog says is being bought.
	 *
	 * The rail (`$lib/game/acquire`) is shared and has no opinion about what
	 * arrives; this sentence is this game's.
	 */
	acquireExplanation:
		'One transaction puts a reserve in your name and funds the key this browser plays with. Whoever pays, the reserve belongs to your account, and only your account can ever withdraw it.',
};

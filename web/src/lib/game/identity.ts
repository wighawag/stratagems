/**
 * WHAT THIS GAME KEYS A SUBMISSION BY.
 *
 * The framework never names a concrete identity: `createSubmission`,
 * `CommitRevealAdapter`, `createDerivedSecret` and `createSubmissionRecovery`
 * are all generic over `TIdentity extends PlayerIdentity`, deliberately,
 * because the games this template exists for disagree about what a player IS.
 * An account-keyed game plays as an address; reveal-or-die and bomber-world
 * commit per ERC721 token; conquest commits per owner-derived empire id.
 *
 * So SOMETHING has to say which one this app chose, and this module is it.
 * It exists so that the choice is made in ONE file rather than spelled out at
 * every site that carries it, and the reason that matters is a merge:
 * `with/nft-identity` is a branch of this repo where the reference game becomes
 * token-keyed, and every shared file that names `0x${string}` as the identity
 * would be a file that branch has to edit and therefore conflict on forever.
 * `core/connection/mode.ts` is the proven version of the same pattern, where
 * `TARGET_STEP` is one constant and one line of difference across three
 * branches. See rules N1 to N3 of Decision 3 in the plan on the `work` branch.
 *
 * TWO WORDS THAT ARE NOT THE SAME WORD, and conflating them is the mistake
 * this module exists to make impossible:
 *
 * - the ACCOUNT is who signed in. It owns things, it pays, and it is an
 *   address in every game and every configuration. `Game.identity` is that,
 *   and so are `acquire`'s `owner`, the reserve's `payer` and everything in
 *   `onchain/delegation.ts`.
 * - the GAME IDENTITY is who PLAYS. The submission, the commitment, the
 *   secret's domain separation, the stake and the submission's storage key are
 *   all keyed by it, and it is what changes shape between games.
 *
 * ON `main` THEY HOLD THE SAME VALUE, because the template is deliberately an
 * address game (decision 3 in HANDOFF). That is exactly why the names have to
 * be separated HERE and now: while the two are equal, nothing forces a caller
 * to say which one it meant, so the day they stop being equal every one of
 * those sites has to be re-read and judged. Separating the names while the
 * values agree is free; separating the values first is not.
 */
import type {Readable} from 'svelte/store';
import type {PlayerIdentity} from './core/seams';

/**
 * THE ONE LINE.
 *
 * This is the whole difference between an address game and a token game, and
 * `with/nft-identity` changes it to `bigint`. Nothing else in this file, and
 * nothing in `game/core/`, has to move for that.
 *
 * A descendant that keys by a token does the same thing in its own copy of
 * this file: reveal-or-die's is `bigint`, which is the entire identity
 * difference between that repo and this one.
 */
export type GameIdentity = `0x${string}`;

/**
 * THE SAME LINE, ON THE OTHER SIDE OF THE ABI.
 *
 * The contract keys every player by a `uint256` and never by an address (see
 * `IGame.sol` and `UsingGameInternal._playerOf`), because twenty bytes holds
 * every account and does not hold every token id: reveal-or-die's are
 * `owner << 96 | subID` and conquest's are derived the same way, so a game
 * that truncated would alias two players onto one reserve with nothing raised
 * anywhere.
 *
 * So SOMETHING has to widen this game's identity into that argument, and it is
 * this function, for the same reason the alias above is one line: every call
 * site that spelled the conversion out would be a shared file the branch has
 * to edit. `with/nft-identity` changes it to the identity itself, because
 * there the identity already IS the number the contract wants.
 *
 * NOT A FORMATTER, and the distinction is what keeps it honest: it is the one
 * place that knows how THIS game's identity is spelled on chain, which is the
 * same job `_playerOf` does in Solidity. The two have to agree, and the e2e
 * submission is what proves they do - a disagreement surfaces as a commitment
 * filed under an identity the reveal cannot find.
 */
export function onchainIdentity(identity: GameIdentity): bigint {
	return BigInt(identity);
}

/**
 * The framework has to be able to carry it.
 *
 * Compile-time only. `PlayerIdentity` is the union the seams accept, so an
 * alias outside it would fail at every call site at once with an error that
 * names the call site rather than the cause. This fails here instead, next to
 * the line that is actually wrong.
 */
type IdentityIsCarryable = GameIdentity extends PlayerIdentity ? true : never;
const _identityIsCarryable: IdentityIsCarryable = true;
void _identityIsCarryable;

/**
 * Which identity this client is playing AS, right now.
 *
 * Undefined before there is one, which is a real state rather than a loading
 * artefact: nobody is signed in yet, or the account holds nothing it can play
 * with. The setup gate turns that into an instruction instead of a dead board.
 *
 * A plain `Readable` and nothing more, on purpose. A game in this tree whose
 * account can own SEVERAL identities already offers a `select` on its own
 * equivalent store, because somebody has to pick; adding one here would ship a
 * capability upstream that no consumer on `main` can exercise, since there is
 * exactly one identity and it is not chosen. A richer store satisfies this
 * type structurally, so a game that needs selection supplies it without this
 * type growing a method that does nothing here.
 *
 * The game is deliberately not named, and neither is what it calls an identity:
 * a citation is only correct while it spells what that repo actually uses, and
 * this file is inherited by every one of them. See `AGENTS.md`, which keeps the
 * list of places where naming one was worth the risk.
 */
export type ActiveIdentityStore = Readable<GameIdentity | undefined>;

/**
 * The identity PROVIDER: where the active identity comes from.
 *
 * D6 requires that identity be a SELECTION rather than a derivation, even
 * where there is exactly one of them, so that several identities per account
 * stays cheap to add later. What that rule actually demands is that every
 * consumer take an `ActiveIdentityStore` and that nothing reconstruct the
 * identity from the account for itself - which is what the rest of this app
 * now does. This function is where the one construction lives.
 *
 * THIS GAME DOES NOT CHOOSE. It is an address game, so there is exactly one
 * identity per account and it is the account's own address; the honest
 * description is not "the identity is the account" but "this game has one
 * identity per account, and that is its address".
 *
 * A GAME THAT DOES CHOOSE REPLACES THIS FUNCTION, and that is the shape to
 * expect rather than a signature with a selection parameter bolted on. The
 * evidence is reveal-or-die, which was checked rather than guessed at: its
 * identity comes from `world/active-avatar.ts`, a store that reads what the
 * account has in custody, drops avatars with no life left, prefers one
 * already in the world and remembers the choice per owner across reloads.
 * None of that can be passed in as a list of candidates, and a `candidates`
 * parameter here would have been an unexercised guess at a shape the one real
 * consumer does not have. So a choosing game supplies its own store, and the
 * only thing this module insists on is the TYPE it has to satisfy.
 */
export function createActiveIdentity(params: {
	/** Who is signed in, which is the only candidate this game has. */
	account: Readable<`0x${string}` | undefined>;
}): ActiveIdentityStore {
	return params.account;
}

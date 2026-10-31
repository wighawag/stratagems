// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "solidity-kit/solc_0_8/ERC20/interfaces/IERC20.sol";
import "../game/interfaces/IGame.sol";
import "./GameToken.sol";

/// @notice Acquiring what lets you play, in ONE transaction.
/// @dev A new player needs two unrelated things before their first move: a
///      stake (or this game has no reason for anyone to reveal) and gas in the
///      local key that signs their moves. Asking for those separately is two
///      wallet prompts, and the second one arrives after the first has just
///      spent the wallet down.
///
///      So the call does both. `msg.value` is split: `stipend` goes to the key
///      that will play, and the remainder must equal `PRICE` exactly. The stake
///      itself is credited to `player` by the game, from tokens this contract
///      mints and stakes on their behalf, which is what removes the
///      mint/approve/stake sequence a player used to sign three times.
///
///      THE PAYER IS NOT THE PLAYER, deliberately, and that is inherited from
///      `addToReserve(player, amount)`: whoever sends this pays, and `player` is
///      credited. An account with no wallet of its own (email or social
///      sign-in) can therefore be set up by somebody else's wallet, and topping
///      up a stranger's reserve is a gift rather than an attack, because only
///      its owner can ever withdraw it.
///
///      MINTING FOR FREE IS THIS TEMPLATE'S ANSWER, not the framework's. The
///      token is a faucet so that a fresh deployment is playable immediately; a
///      real game replaces this contract with whatever actually gates entry
///      (selling a token, minting an NFT into custody, checking a pass), and
///      the client rail above it does not change, because all it needs is one
///      call that carries a value and forwards a stipend.
contract StakeSale {
    /// @notice `msg.value` minus the stipend was not the price.
    /// @dev Exact rather than a minimum: a client that sizes the value from the
    ///      price alone, and separately asks for a stipend, would otherwise
    ///      silently overpay by the stipend on every purchase.
    error WrongPaymentAmount(uint256 amount, uint256 expected);
    error FailedToTransferNativeToken(address recipient, uint256 amount);

    /// @notice One player set up: staked, and their play key funded.
    /// @dev `sender` is kept apart from `owner` because they are routinely
    ///      different addresses, and reading the log as though they were the
    ///      same is how a payer gets mistaken for a participant.
    event Staked(
        address indexed sender,
        address indexed owner,
        uint256 amount,
        address stipendTo,
        uint256 stipend
    );

    GameToken public immutable TOKENS;
    IGameCommit public immutable GAME;
    /// @notice What one stake costs, in the chain's own currency. May be zero.
    uint256 public immutable PRICE;
    /// @notice How much stake one purchase credits.
    uint256 public immutable AMOUNT;
    address payable public immutable RECIPIENT;

    struct Config {
        uint256 price;
        uint256 amount;
        address payable recipient;
    }

    constructor(GameToken tokens, IGameCommit game, Config memory config) {
        TOKENS = tokens;
        GAME = game;
        PRICE = config.price;
        AMOUNT = config.amount;
        RECIPIENT = config.recipient;
    }

    /// @notice Stake for `owner`, and fund the key that will play for them.
    /// @param owner The account the stake is credited to. Not necessarily the
    ///        caller: see the note on the contract.
    /// @dev AN ADDRESS HERE AND A `uint256` AT THE GAME, deliberately. The sale
    ///      is where an account turns into whatever this game plays as, which
    ///      is why the widening happens in THIS contract and not in the client:
    ///      a game whose identity is a token mints one here instead, and the
    ///      rail above (`web/src/lib/game/acquire`) sends the same call with
    ///      the same arguments either way.
    /// @param stipendTo The local key to forward gas to, or the zero address
    ///        when there is none, in which case `stipend` must be zero and
    ///        `msg.value` is the price alone.
    /// @param stipend How much of `msg.value` is gas for that key rather than
    ///        payment for the stake.
    /// @dev The stipend is sized by the CLIENT, not here, because what it is
    ///        worth is a number of turns at the chain's gas price and only the
    ///        client knows both. This contract's job is only to make it one
    ///        transaction.
    function purchase(
        address owner,
        address payable stipendTo,
        uint256 stipend
    ) external payable {
        _purchase(GAME, owner, stipendTo, stipend);
    }

    /// @notice {purchase}, for another game played with the same token: a
    ///         table for a fixed set of players, cloned per game by a factory,
    ///         which no immutable here could name in advance.
    /// @dev Open to any address on purpose. The tokens are minted for this
    ///      purchase alone and approved to `game` alone, so a `game` that is not
    ///      one only ever takes what its own buyer paid for.
    function purchaseAt(
        IGameCommit game,
        address owner,
        address payable stipendTo,
        uint256 stipend
    ) external payable {
        _purchase(game, owner, stipendTo, stipend);
    }

    function _purchase(
        IGameCommit game,
        address owner,
        address payable stipendTo,
        uint256 stipend
    ) internal {
        uint256 paymentAmount = msg.value;
        if (stipendTo != address(0)) {
            // Underflows, and so reverts, when the value does not even cover the
            // stipend. That is the right outcome and needs no message of its
            // own: the alternative is funding a key out of the price.
            paymentAmount -= stipend;
        } else if (stipend != 0) {
            // A stipend with nowhere to go would be kept by this contract, which
            // is money the player cannot get back.
            revert FailedToTransferNativeToken(stipendTo, stipend);
        }
        if (paymentAmount != PRICE) {
            revert WrongPaymentAmount(paymentAmount, PRICE);
        }

        // Effects before the transfers below. This contract keeps no storage at
        // all, so there is nothing a re-entrant call could corrupt, but the
        // ordering costs nothing and a game that copies this shape may well add
        // some.
        TOKENS.mint(address(this), AMOUNT);
        TOKENS.approve(address(game), AMOUNT);
        // THE ADDRESS GAME'S IDENTITY, spelled out at the one place that knows
        // this game is one.
        game.addToReserve(uint256(uint160(owner)), AMOUNT);

        if (stipendTo != address(0) && stipend != 0) {
            _send(stipendTo, stipend);
        }
        if (paymentAmount != 0) {
            _send(RECIPIENT, paymentAmount);
        }

        emit Staked(msg.sender, owner, AMOUNT, stipendTo, stipend);
    }

    /// @dev `call` rather than `transfer`: the 2300 gas stamp is not enough for
    ///      a contract account, and both recipients here can be one - a smart
    ///      account playing the game, or a treasury.
    function _send(address payable to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}("");
        if (!success) {
            revert FailedToTransferNativeToken(to, amount);
        }
    }
}

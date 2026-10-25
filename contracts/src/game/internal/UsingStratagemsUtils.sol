// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.21;

import "../interface/UsingStratagemsTypes.sol";

abstract contract UsingStratagemsUtils is UsingStratagemsTypes {
    /// @notice The one encoding of a chunk: `bytes24(keccak256(abi.encode(secret, moves, furtherActions)))`.
    /// @dev alpha1 had two (its last chunk dropped `furtherMoves`); the base has one.
    function _digest(
        Move[] memory moves,
        bytes32 secret,
        bytes24 furtherActions
    ) internal pure returns (bytes24) {
        return bytes24(keccak256(abi.encode(secret, moves, furtherActions)));
    }

    /// @dev A payout to the zero address (a share owed to a cell nobody owns)
    ///      is not made: it stays in the contract, as no transfer can reach it.
    function _collectTransfer(
        TokenTransferCollection memory transferCollection,
        TokenTransfer memory newTransfer
    ) internal pure {
        if (newTransfer.to == address(0) || newTransfer.amount == 0) {
            return;
        }
        for (uint256 k = 0; k < transferCollection.numTransfers; k++) {
            if (transferCollection.transfers[k].to == newTransfer.to) {
                transferCollection.transfers[k].amount += newTransfer.amount;
                return;
            }
        }
        transferCollection.transfers[transferCollection.numTransfers].to = newTransfer.to;
        transferCollection.transfers[transferCollection.numTransfers].amount = newTransfer.amount;
        transferCollection.numTransfers++;
    }

    function _multiTransfer(IERC20 token, TokenTransferCollection memory transferCollection) internal {
        for (uint256 i = 0; i < transferCollection.numTransfers; i++) {
            token.transfer(transferCollection.transfers[i].to, transferCollection.transfers[i].amount);
        }
    }
}

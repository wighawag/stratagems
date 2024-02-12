// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../interface/UsingStratagemsTypes.sol";
import "../interface/UsingStratagemsErrors.sol";

abstract contract UsingStratagemsUtils is UsingStratagemsTypes, UsingStratagemsErrors {
    function _checkHash(
        bytes24 commitmentHash,
        bytes32 secret,
        Move[] memory moves,
        bytes24 furtherMoves
    ) internal pure {
        if (furtherMoves != bytes24(0)) {
            bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves, furtherMoves)));
            if (commitmentHash != computedHash) {
                revert CommitmentHashNotMatching();
            }
        } else {
            bytes24 computedHash = bytes24(keccak256(abi.encode(secret, moves)));
            if (commitmentHash != computedHash) {
                revert CommitmentHashNotMatching();
            }
        }
    }

    function _collectTransfer(
        TokenTransferCollection memory transferCollection,
        TokenTransfer memory newTransfer
    ) internal pure {
        // we look for the newTransfer address in case it is already present
        for (uint256 k = 0; k < transferCollection.numTransfers; k++) {
            if (transferCollection.transfers[k].to == newTransfer.to) {
                // if we found we add the amount
                transferCollection.transfers[k].amount += newTransfer.amount;
                return;
            }
        }
        // if we did not find that address we add it to the end
        transferCollection.transfers[transferCollection.numTransfers].to = newTransfer.to;
        transferCollection.transfers[transferCollection.numTransfers].amount = newTransfer.amount;
        // and increase the size to lookup for next time
        transferCollection.numTransfers++;
    }

    function _multiTransfer(IERC20WithIERC2612 token, TokenTransferCollection memory transferCollection) internal {
        for (uint256 i = 0; i < transferCollection.numTransfers; i++) {
            token.transfer(transferCollection.transfers[i].to, transferCollection.transfers[i].amount);
        }
    }
}

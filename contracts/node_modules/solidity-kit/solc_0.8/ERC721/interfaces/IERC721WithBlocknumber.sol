// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC721WithBlocknumber {
    /// @notice Get the owner of a token and the blockNumber of the last transfer, useful to voting mechanism.
    /// @param tokenID The id of the token.
    /// @return owner The address of the token owner.
    /// @return blockNumber The blocknumber at which the last transfer of that id happened.
    function ownerAndLastTransferBlockNumberOf(uint256 tokenID)
        external
        view
        returns (address owner, uint256 blockNumber);

    struct OwnerData {
        address owner;
        uint256 lastTransferBlockNumber;
    }

    /// @notice Get the list of owner of a token and the blockNumber of its last transfer, useful to voting mechanism.
    /// @param tokenIDs The list of token ids to check.
    /// @return ownersData The list of (owner, lastTransferBlockNumber) for each ids given as input.
    function ownerAndLastTransferBlockNumberList(uint256[] calldata tokenIDs)
        external
        view
        returns (OwnerData[] memory ownersData);
}

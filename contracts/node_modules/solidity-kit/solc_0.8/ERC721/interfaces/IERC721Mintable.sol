// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC721Mintable {}

interface IERC721WithExternalMinter {
    /// @notice Triggered when the account in charge of minter updates is updated/set.
    /// @param newMinterAdmin the new minter admin
    event MinterAdminSet(address newMinterAdmin);
    /// @notice Triggered when the minter is updated/set.
    /// @param newMinter the new minter
    event MinterSet(address newMinter);

    /// @notice minterAdmin can update the minter.
    function minterAdmin() external returns (address);

    /// @notice address allowed to mint, allow the sale contract to be separated from the token contract.
    function minter() external returns (address);

    /// @notice set the new minterAdmin that can set the minter
    /// @param newMinterAdmin new address to use as minter admin
    function setMinterAdmin(address newMinterAdmin) external;

    /// @notice set the new minter that can mint
    /// @param newMinter new address to use as minter
    function setMinter(address newMinter) external;
}

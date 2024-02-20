// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../ERC165/interfaces/IERC165.sol";

interface IERC2981 is IERC165 {
    /// @notice Called with the sale price to determine how much royalty is owed and to whom.
    /// @param tokenID the token queried for royalty information.
    /// @param salePrice - the sale price of the token specified by `tokenID`.
    /// @return receiver - address of who should be sent the royalty payment.
    /// @return royaltyAmount - the royalty payment amount for salePrice.
    function royaltyInfo(uint256 tokenID, uint256 salePrice)
        external
        view
        returns (address receiver, uint256 royaltyAmount);
}

interface IERC2981Administration {
    /// @notice Triggered when Royalty receiver and/or rate is updated/set
    /// @param receiver the account receiving the royalty
    /// @param royaltyPer10Thousands the royalty rate (per 10,000)
    event RoyaltySet(address receiver, uint256 royaltyPer10Thousands);
    /// @notice Triggered when the account in charge of royalty settings is updated/set.
    /// @param newRoyaltyAdmin the new royalty admin
    event RoyaltyAdminSet(address newRoyaltyAdmin);

    /// @notice The Royality rate exceed the maximum allowed
    /// @param royaltyPer10ThousandsProvided royalty rate provided (per 10,000)
    /// @param max maximum rate allowed (per 10,000)
    error RoyaltyTooHigh(uint256 royaltyPer10ThousandsProvided, uint256 max);

    /// @notice address allowed to set royalty parameters
    function royaltyAdmin() external returns (address);

    /// @notice set a new royalty receiver and rate, Can only be set by the `royaltyAdmin`.
    /// @param newReceiver the address that should receive the royalty proceeds.
    /// @param royaltyPer10Thousands the share of the salePrice (in 1/10000) given to the receiver.
    function setRoyaltyParameters(address newReceiver, uint96 royaltyPer10Thousands) external;

    /// @notice set the new royaltyAdmin that can change the royalties.
    /// @param newRoyaltyAdmin admin's address going forward
    function setRoyaltyAdmin(address newRoyaltyAdmin) external;
}

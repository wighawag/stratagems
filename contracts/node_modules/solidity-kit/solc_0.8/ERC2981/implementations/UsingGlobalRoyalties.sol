// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IERC2981.sol";
import "../../ERC165/implementations/UsingERC165Internal.sol";
import "../../utils/Guardian/libraries/Guarded.sol";
import "../../utils/GenericErrors.sol";

contract UsingGlobalRoyalties is IERC2981, IERC2981Administration, UsingERC165Internal {
    struct Royalty {
        address receiver;
        uint96 per10Thousands;
    }

    Royalty internal _royalty;

    /// @inheritdoc IERC2981Administration
    address public royaltyAdmin;

    /// @param initialRoyaltyReceiver receiver of royalties
    /// @param imitialRoyaltyPer10Thousands amount of royalty in 10,000 basis point
    /// @param initialRoyaltyAdmin admin able to update the royalty receiver and rates
    constructor(
        address initialRoyaltyReceiver,
        uint96 imitialRoyaltyPer10Thousands,
        address initialRoyaltyAdmin
    ) {
        if (initialRoyaltyAdmin != address(0)) {
            royaltyAdmin = initialRoyaltyAdmin;
            emit RoyaltyAdminSet(initialRoyaltyAdmin);
        }

        _royalty.receiver = initialRoyaltyReceiver;
        _royalty.per10Thousands = imitialRoyaltyPer10Thousands;
        emit RoyaltySet(initialRoyaltyReceiver, imitialRoyaltyPer10Thousands);
    }

    /// @inheritdoc IERC2981
    function royaltyInfo(
        uint256, /*id*/
        uint256 salePrice
    ) external view returns (address receiver, uint256 royaltyAmount) {
        receiver = _royalty.receiver;
        royaltyAmount = (salePrice * uint256(_royalty.per10Thousands)) / 10000;
    }

    /// @inheritdoc IERC2981Administration
    function setRoyaltyParameters(address newReceiver, uint96 royaltyPer10Thousands) external {
        if (msg.sender != royaltyAdmin) {
            revert NotAuthorized();
        }
        if (royaltyPer10Thousands > 50) {
            revert RoyaltyTooHigh(royaltyPer10Thousands, 50);
        }
        if (_royalty.receiver != newReceiver || _royalty.per10Thousands != royaltyPer10Thousands) {
            _royalty.receiver = newReceiver;
            _royalty.per10Thousands = royaltyPer10Thousands;
            emit RoyaltySet(newReceiver, royaltyPer10Thousands);
        }
    }

    /// @inheritdoc IERC2981Administration
    function setRoyaltyAdmin(address newRoyaltyAdmin) external {
        if (msg.sender != royaltyAdmin && !Guarded.isGuardian(msg.sender, newRoyaltyAdmin)) {
            revert NotAuthorized();
        }
        if (royaltyAdmin != newRoyaltyAdmin) {
            royaltyAdmin = newRoyaltyAdmin;
            emit RoyaltyAdminSet(newRoyaltyAdmin);
        }
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceID)
        public
        view
        virtual
        override(IERC165, UsingERC165Internal)
        returns (bool)
    {
        return super.supportsInterface(interfaceID) || interfaceID == 0x2a55205a; /// 0x2a55205a is ERC2981 (royalty standard)
    }
}

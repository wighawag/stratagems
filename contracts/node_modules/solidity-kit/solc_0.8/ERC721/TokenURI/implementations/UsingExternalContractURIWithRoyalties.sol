// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IContractURI.sol";
import "../../../ERC2981/implementations/UsingGlobalRoyalties.sol";
import "../../../utils/Guardian/libraries/Guarded.sol";

contract UsingExternalContractURIWithRoyalties is UsingGlobalRoyalties, IERC721WithExternalContractURI {
    /// @inheritdoc IERC721WithExternalContractURI
    IExternalContractURI public contractURIAddress;

    /// @inheritdoc IERC721WithExternalContractURI
    address public contractURIAdmin;

    /// @param initialContractURIAdmin admin able to update the contractURI contract.
    /// @param initialContractURIAddress initial contractURI contract that generate the metadata including the wav file.
    /// @param initialRoyaltyReceiver receiver of royalties
    /// @param imitialRoyaltyPer10Thousands amount of royalty in 10,000 basis point
    /// @param initialRoyaltyAdmin admin able to update the royalty receiver and rates
    constructor(
        address initialContractURIAdmin,
        IExternalContractURI initialContractURIAddress,
        address initialRoyaltyReceiver,
        uint96 imitialRoyaltyPer10Thousands,
        address initialRoyaltyAdmin
    ) UsingGlobalRoyalties(initialRoyaltyReceiver, imitialRoyaltyPer10Thousands, initialRoyaltyAdmin) {
        if (address(initialContractURIAddress) != address(0)) {
            contractURIAddress = initialContractURIAddress;
            emit ContractURIAddressSet(initialContractURIAddress);
        }

        if (initialContractURIAdmin != address(0)) {
            contractURIAdmin = initialContractURIAdmin;
            emit ContractURIAdminSet(initialContractURIAdmin);
        }
    }

    /// @inheritdoc IERC721WithExternalContractURI
    function setContractURIAdmin(address newContractURIAdmin) external {
        if (msg.sender != contractURIAdmin && !Guarded.isGuardian(msg.sender, newContractURIAdmin)) {
            revert NotAuthorized();
        }
        if (contractURIAdmin != newContractURIAdmin) {
            contractURIAdmin = newContractURIAdmin;
            emit ContractURIAdminSet(newContractURIAdmin);
        }
    }

    /// @inheritdoc IContractURI
    function contractURI() external view returns (string memory) {
        return contractURIAddress.contractURI(_royalty.receiver, _royalty.per10Thousands);
    }

    /// @inheritdoc IERC721WithExternalContractURI
    function setContractURI(IExternalContractURI newContractURIAddress) external {
        if (msg.sender != contractURIAdmin) {
            revert NotAuthorized();
        }
        if (contractURIAddress != newContractURIAddress) {
            contractURIAddress = newContractURIAddress;
            emit ContractURIAddressSet(newContractURIAddress);
        }
    }
}

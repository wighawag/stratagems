// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/ITokenURI.sol";
import "../../../utils/Guardian/libraries/Guarded.sol";
import "../../../utils/GenericErrors.sol";

contract UsingExternalTokenURI is IERC721WithExternalTokenURI {
    /// @inheritdoc IERC721WithExternalTokenURI
    ITokenURI public tokenURIContract;

    /// @inheritdoc IERC721WithExternalTokenURI
    address public tokenURIAdmin;

    /// @param initialTokenURIAdmin admin able to update the tokenURI contract.
    /// @param initialTokenURIContract initial tokenURI contract that generate the metadata including the wav file.
    constructor(address initialTokenURIAdmin, ITokenURI initialTokenURIContract) {
        if (address(initialTokenURIContract) != address(0)) {
            tokenURIContract = initialTokenURIContract;
            emit TokenURIContractSet(initialTokenURIContract);
        }
        if (initialTokenURIAdmin != address(0)) {
            tokenURIAdmin = initialTokenURIAdmin;
            emit TokenURIAdminSet(initialTokenURIAdmin);
        }
    }

    /// @inheritdoc IERC721WithExternalTokenURI
    function setTokenURIAdmin(address newTokenURIAdmin) external {
        if (msg.sender != tokenURIAdmin && !Guarded.isGuardian(msg.sender, newTokenURIAdmin)) {
            revert NotAuthorized();
        }
        if (tokenURIAdmin != newTokenURIAdmin) {
            tokenURIAdmin = newTokenURIAdmin;
            emit TokenURIAdminSet(newTokenURIAdmin);
        }
    }

    /// @inheritdoc ITokenURI
    function tokenURI(uint256 tokenID) external view returns (string memory) {
        return tokenURIContract.tokenURI(tokenID);
    }

    /// @inheritdoc IERC721WithExternalTokenURI
    function setTokenURIContract(ITokenURI newTokenURIContract) external {
        if (msg.sender != tokenURIAdmin) {
            revert NotAuthorized();
        }
        if (tokenURIContract != newTokenURIContract) {
            tokenURIContract = newTokenURIContract;
            emit TokenURIContractSet(newTokenURIContract);
        }
    }
}

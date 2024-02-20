// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../utils/Guardian/libraries/Guarded.sol";
import "../interfaces/IERC721Mintable.sol";
import "../../utils/GenericErrors.sol";

contract UsingExternalMinter is IERC721WithExternalMinter {
    /// @inheritdoc IERC721WithExternalMinter
    address public minterAdmin;

    /// @inheritdoc IERC721WithExternalMinter
    address public minter;

    constructor(address initialMinterAdmin) {
        if (initialMinterAdmin != address(0)) {
            minterAdmin = initialMinterAdmin;
            emit MinterAdminSet(initialMinterAdmin);
        }
    }

    /// @inheritdoc IERC721WithExternalMinter
    function setMinterAdmin(address newMinterAdmin) external {
        if (msg.sender != minterAdmin && !Guarded.isGuardian(msg.sender, newMinterAdmin)) {
            revert NotAuthorized();
        }
        if (newMinterAdmin != minterAdmin) {
            minterAdmin = newMinterAdmin;
            emit MinterAdminSet(newMinterAdmin);
        }
    }

    /// @inheritdoc IERC721WithExternalMinter
    function setMinter(address newMinter) external {
        if (msg.sender != minterAdmin) {
            revert NotAuthorized();
        }
        if (minter != newMinter) {
            minter = newMinter;
            emit MinterSet(newMinter);
        }
    }
}

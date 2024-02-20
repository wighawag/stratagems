// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IERC721Receiver.sol";
import "../interfaces/IERC721.sol";
import "../interfaces/IERC721WithBlocknumber.sol";
import "./ImplementingERC721Internal.sol";

import "../../openzeppelin/contracts/utils/Address.sol";

abstract contract BasicERC721 is IERC721, IERC721WithBlocknumber, ImplementingERC721Internal {
    using Openzeppelin_Address for address;

    bytes4 internal constant ERC721_RECEIVED = 0x150b7a02;

    uint256 internal constant OPERATOR_FLAG = 0x8000000000000000000000000000000000000000000000000000000000000000;

    mapping(uint256 => uint256) internal _owners;
    mapping(address => uint256) internal _balances;
    mapping(address => mapping(address => bool)) internal _operatorsForAll;
    mapping(uint256 => address) internal _operators;

    /// @inheritdoc IERC721
    function approve(address operator, uint256 tokenID) external override {
        (address owner, uint256 nonce) = _ownerAndNonceOf(tokenID);
        if (owner == address(0)) {
            revert NonExistentToken(tokenID);
        }
        if (msg.sender != owner && !isApprovedForAll(owner, msg.sender)) {
            revert NotAuthorized();
        }
        _approveFor(owner, nonce, operator, tokenID);
    }

    /// @inheritdoc IERC721
    function transferFrom(
        address from,
        address to,
        uint256 tokenID
    ) external override {
        (address owner, uint256 nonce, bool operatorEnabled) = _ownerNonceAndOperatorEnabledOf(tokenID);
        if (owner == address(0)) {
            revert NonExistentToken(tokenID);
        }
        if (from != owner) {
            revert NotOwner(from, owner);
        }
        if (to == address(0) || to == address(this)) {
            revert InvalidAddress(to);
        }
        if (msg.sender != from) {
            if (!(operatorEnabled && _operators[tokenID] == msg.sender) && !isApprovedForAll(from, msg.sender)) {
                revert NotAuthorized();
            }
        }
        _transferFrom(from, to, tokenID, (nonce >> 24) != 0);
    }

    /// @inheritdoc IERC721
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenID
    ) external override {
        safeTransferFrom(from, to, tokenID, "");
    }

    /// @inheritdoc IERC721
    function setApprovalForAll(address operator, bool approved) external override {
        _setApprovalForAll(msg.sender, operator, approved);
    }

    /// @inheritdoc IERC721
    function balanceOf(address owner) public view virtual override returns (uint256 balance) {
        if (owner == address(0)) {
            revert InvalidAddress(owner);
        }
        balance = _balances[owner];
    }

    /// @inheritdoc IERC721
    function ownerOf(uint256 tokenID) external view override returns (address owner) {
        owner = _ownerOf(tokenID);
        if (owner == address(0)) {
            revert NonExistentToken(tokenID);
        }
    }

    /// @inheritdoc IERC721
    function getApproved(uint256 tokenID) external view override returns (address operator) {
        (address owner, bool operatorEnabled) = _ownerAndOperatorEnabledOf(tokenID);
        if (owner == address(0)) {
            revert NonExistentToken(tokenID);
        }
        if (operatorEnabled) {
            return _operators[tokenID];
        } else {
            return address(0);
        }
    }

    /// @inheritdoc IERC721
    function isApprovedForAll(address owner, address operator) public view virtual override returns (bool isOperator) {
        return _operatorsForAll[owner][operator];
    }

    /// @inheritdoc IERC721
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenID,
        bytes memory data
    ) public override {
        (address owner, uint256 nonce, bool operatorEnabled) = _ownerNonceAndOperatorEnabledOf(tokenID);
        if (owner == address(0)) {
            revert NonExistentToken(tokenID);
        }
        if (owner != from) {
            revert NotOwner(from, owner);
        }

        if (to == address(0) || to == address(this)) {
            revert InvalidAddress(to);
        }

        if (msg.sender != from) {
            if (!(operatorEnabled && _operators[tokenID] == msg.sender) && !isApprovedForAll(from, msg.sender)) {
                revert NotAuthorized();
            }
        }
        _safeTransferFrom(from, to, tokenID, (nonce >> 24) != 0, data);
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceID) public view virtual override returns (bool) {
        /// 0x01ffc9a7 is ERC165.
        /// 0x80ac58cd is ERC721
        /// 0x5b5e139f is for ERC721 metadata
        return interfaceID == 0x01ffc9a7 || interfaceID == 0x80ac58cd || interfaceID == 0x5b5e139f;
    }

    /// @inheritdoc IERC721WithBlocknumber
    function ownerAndLastTransferBlockNumberOf(uint256 tokenID)
        external
        view
        override
        returns (address owner, uint256 blockNumber)
    {
        (address currentOwner, uint256 nonce) = _ownerAndNonceOf(tokenID);
        owner = currentOwner;
        blockNumber = (nonce >> 24);
    }

    /// @inheritdoc IERC721WithBlocknumber
    function ownerAndLastTransferBlockNumberList(uint256[] calldata tokenIDs)
        external
        view
        virtual
        returns (OwnerData[] memory ownersData)
    {
        ownersData = new OwnerData[](tokenIDs.length);
        for (uint256 i = 0; i < tokenIDs.length; i++) {
            uint256 data = _owners[tokenIDs[i]];
            ownersData[i].owner = address(uint160(data));
            ownersData[i].lastTransferBlockNumber = (data >> 184) & 0xFFFFFFFFFFFFFFFF;
        }
    }

    // ------------------------------------------------------------------------------------------------------------------
    // INTERNALS
    // ------------------------------------------------------------------------------------------------------------------

    function _safeMint(address to, uint256 tokenID) internal {
        _safeTransferFrom(address(0), to, tokenID, false, "");
    }

    function _safeTransferFrom(
        address from,
        address to,
        uint256 tokenID,
        bool registered,
        bytes memory data
    ) internal {
        _transferFrom(from, to, tokenID, registered);
        if (to.isContract()) {
            if (!_checkOnERC721Received(msg.sender, from, to, tokenID, data)) {
                revert TransferRejected();
            }
        }
    }

    function _transferFrom(
        address from,
        address to,
        uint256 tokenID,
        bool registered
    ) internal virtual {
        unchecked {
            _balances[to]++;
            if (registered) {
                _balances[from]--;
            }
        }

        // We encode the blockNumber in the token nonce. We can then use it for count voting.
        _owners[tokenID] = (block.number << 184) | uint256(uint160(to));
        emit Transfer(from, to, tokenID);
    }

    /// @dev See approve.
    function _approveFor(
        address owner,
        uint256 nonce,
        address operator,
        uint256 tokenID
    ) internal override {
        uint256 blockNumber = nonce >> 24;
        uint256 newNonce = nonce + 1;
        if (newNonce >> 24 != blockNumber) {
            revert NonceOverflow();
        }
        if (operator == address(0)) {
            _owners[tokenID] = (newNonce << 160) | uint256(uint160(owner));
        } else {
            _owners[tokenID] = OPERATOR_FLAG | ((newNonce << 160) | uint256(uint160(owner)));
            _operators[tokenID] = operator;
        }
        emit Approval(owner, operator, tokenID);
    }

    /// @dev See setApprovalForAll.
    function _setApprovalForAll(
        address sender,
        address operator,
        bool approved
    ) internal override {
        _operatorsForAll[sender][operator] = approved;

        emit ApprovalForAll(sender, operator, approved);
    }

    /// @dev Check if receiving contract accepts erc721 transfers.
    /// @param operator The address of the operator.
    /// @param from The from address, may be different from msg.sender.
    /// @param to The adddress we want to transfer to.
    /// @param tokenID The id of the token we would like to transfer.
    /// @param data Any additional data to send with the transfer.
    /// @return Whether the expected value of 0x150b7a02 is returned.
    function _checkOnERC721Received(
        address operator,
        address from,
        address to,
        uint256 tokenID,
        bytes memory data
    ) internal returns (bool) {
        bytes4 retval = IERC721Receiver(to).onERC721Received(operator, from, tokenID, data);
        return (retval == ERC721_RECEIVED);
    }

    /// @dev Get the owner of a token.
    /// @param tokenID The token to query.
    function _ownerOf(uint256 tokenID) internal view virtual returns (address owner) {
        return address(uint160(_owners[tokenID]));
    }

    /// @dev Get the owner and operatorEnabled status of a token.
    /// @param tokenID The token to query.
    /// @return owner The owner of the token.
    /// @return operatorEnabled Whether or not operators are enabled for this token.
    function _ownerAndOperatorEnabledOf(uint256 tokenID)
        internal
        view
        virtual
        returns (address owner, bool operatorEnabled)
    {
        uint256 data = _owners[tokenID];
        owner = address(uint160(data));
        operatorEnabled = (data & OPERATOR_FLAG) == OPERATOR_FLAG;
    }

    /// @dev Get the owner and the permit nonce of a token.
    /// @param tokenID The token to query.
    /// @return owner The owner of the token.
    /// @return nonce the nonce for permit (also incluse the blocknumer in the 64 higer bits (88 bits in total))
    function _ownerAndNonceOf(uint256 tokenID) internal view virtual override returns (address owner, uint256 nonce) {
        uint256 data = _owners[tokenID];
        owner = address(uint160(data));
        nonce = (data >> 160) & 0xFFFFFFFFFFFFFFFFFFFFFF;
    }

    // @dev Get the owner, the permit nonce of a token and operatorEnabled status of a token.
    /// @param tokenID The token to query.
    /// @return owner The owner of the token.
    /// @return nonce the nonce for permit (also incluse the blocknumer in the 64 higer bits (88 bits in total))
    /// @return operatorEnabled Whether or not operators are enabled for this token.
    function _ownerNonceAndOperatorEnabledOf(uint256 tokenID)
        internal
        view
        virtual
        returns (
            address owner,
            uint256 nonce,
            bool operatorEnabled
        )
    {
        uint256 data = _owners[tokenID];
        owner = address(uint160(data));
        operatorEnabled = (data & OPERATOR_FLAG) == OPERATOR_FLAG;
        nonce = (data >> 160) & 0xFFFFFFFFFFFFFFFFFFFFFF;
    }
}

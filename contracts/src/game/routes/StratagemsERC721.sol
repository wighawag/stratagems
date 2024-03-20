// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../internal/UsingStratagemsSetters.sol";
import "solidity-kit/solc_0_8/ERC721/interfaces/IERC721.sol";
import "solidity-kit/solc_0_8/ERC721/interfaces/UsingERC721Errors.sol";
import "solidity-kit/solc_0_8/ERC721/interfaces/IERC721Metadata.sol";
import "solidity-kit/solc_0_8/ERC721/interfaces/IERC721WithBlocknumber.sol";
import "solidity-kit/solc_0_8/ERC721/interfaces/IERC721Receiver.sol";
import "solidity-kit/solc_0_8/ERC721/implementations/ImplementingERC721Internal.sol";
import "solidity-kit/solc_0_8/openzeppelin/contracts/utils/Address.sol";
import "solidity-kit/solc_0_8/utils/UsingGenericErrors.sol";

contract StratagemsERC721 is
    IERC721,
    IERC721Metadata,
    IERC721WithBlocknumber,
    UsingStratagemsSetters,
    ImplementingERC721Internal,
    UsingERC721Errors
{
    using Openzeppelin_Address for address;

    constructor(Config memory config) UsingStratagemsSetters(config) {}

    bytes4 internal constant ERC721_RECEIVED = 0x150b7a02;
    uint256 internal constant OPERATOR_FLAG = 0x8000000000000000000000000000000000000000000000000000000000000000;

    // --------------------------------------------------------------------------------------------
    // Getters
    // --------------------------------------------------------------------------------------------

    // /// @inheritdoc IERC721
    /// @notice balanceOf is not implemented, keeping track of this add gas and we did not consider that worth it
    function balanceOf(address) external pure override returns (uint256) {
        revert UsingGenericErrors.NotImplemented();
        // if (owner == address(0)) {
        // 	revert InvalidAddress(owner);
        // }
        // balance = _balances[owner];
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
    function isApprovedForAll(address owner, address operator) public view override returns (bool) {
        return _operatorsForAll[owner][operator];
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceID) external pure returns (bool) {
        /// 0x01ffc9a7 is ERC165.
        /// 0x80ac58cd is ERC721
        /// 0x5b5e139f is for ERC721 metadata
        return interfaceID == 0x01ffc9a7 || interfaceID == 0x80ac58cd || interfaceID == 0x5b5e139f;
    }

    /// @inheritdoc IERC721Metadata
    function name() external pure returns (string memory) {
        return "Islands";
    }

    /// @inheritdoc IERC721Metadata
    function symbol() external pure returns (string memory) {
        return "ISLAND";
    }

    /// @inheritdoc IERC721Metadata
    function tokenURI(uint256 tokenID) external view returns (string memory) {
        (uint24 epoch, ) = _epoch();
        (Cell memory cell, ) = _getUpdatedCell(uint64(tokenID), epoch);
        (int32 x, int32 y) = PositionUtils.toXY(uint64(tokenID));

        (string memory factionName, string memory factionColor) = _factionDisplay(cell.color);

        DisplayData memory data = DisplayData({
            x: StringUtils.toString(x),
            y: StringUtils.toString(y),
            life: StringUtils.toString(cell.life),
            delta: StringUtils.toString(_effectiveDelta(cell.delta, cell.enemyMap)),
            creationEpoch: StringUtils.toString(cell.epochWhenTokenIsAdded),
            factionName: factionName,
            factionColor: factionColor
        });

        string memory svgURI = _svgURI(data);
        return
            string.concat(
                'data:application/json,{"name":"Island%20(',
                data.x,
                ",",
                data.y,
                ')","description":"A%20Piece%20Of%20Land%20In%20Stratagems,%20An%20Autonomous%20World%20Created%20By%20Players.","image":"',
                svgURI,
                '"}'
            );
    }

    /// @inheritdoc IERC721WithBlocknumber
    function ownerAndLastTransferBlockNumberOf(
        uint256 tokenID
    ) external view override returns (address owner, uint256 blockNumber) {
        (address currentOwner, uint256 nonce) = _ownerAndNonceOf(tokenID);
        owner = currentOwner;
        blockNumber = (nonce >> 24);
    }

    /// @inheritdoc IERC721WithBlocknumber
    function ownerAndLastTransferBlockNumberList(
        uint256[] calldata tokenIDs
    ) external view virtual returns (OwnerData[] memory ownersData) {
        ownersData = new OwnerData[](tokenIDs.length);
        for (uint256 i = 0; i < tokenIDs.length; i++) {
            uint256 data = _owners[tokenIDs[i]];
            ownersData[i].owner = address(uint160(data));
            ownersData[i].lastTransferBlockNumber = (data >> 184) & 0xFFFFFFFFFFFFFFFF;
        }
    }

    // --------------------------------------------------------------------------------------------
    // Setters
    // --------------------------------------------------------------------------------------------

    /// @inheritdoc IERC721
    function safeTransferFrom(address from, address to, uint256 tokenID, bytes memory data) public override {
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
                revert UsingGenericErrors.NotAuthorized();
            }
        }
        _safeTransferFrom(from, to, tokenID, (nonce >> 24) != 0, data);
    }

    /// @inheritdoc IERC721
    function safeTransferFrom(address from, address to, uint256 tokenID) external override {
        safeTransferFrom(from, to, tokenID, "");
    }

    /// @inheritdoc IERC721
    function transferFrom(address from, address to, uint256 tokenID) external override {
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
                revert UsingGenericErrors.NotAuthorized();
            }
        }
        _transferFrom(from, to, tokenID, (nonce >> 24) != 0);
    }

    /// @inheritdoc IERC721
    function approve(address operator, uint256 tokenID) external override {
        (address owner, uint256 nonce) = _ownerAndNonceOf(tokenID);
        if (owner == address(0)) {
            revert NonExistentToken(tokenID);
        }
        if (msg.sender != owner && !isApprovedForAll(owner, msg.sender)) {
            revert UsingGenericErrors.NotAuthorized();
        }
        _approveFor(owner, nonce, operator, tokenID);
    }

    /// @inheritdoc IERC721
    function setApprovalForAll(address operator, bool approved) external override {
        _setApprovalForAll(msg.sender, operator, approved);
    }

    // ------------------------------------------------------------------------------------------------------------------
    // INTERNALS
    // ------------------------------------------------------------------------------------------------------------------

    function _safeMint(address to, uint256 tokenID) internal {
        _safeTransferFrom(address(0), to, tokenID, false, "");
    }

    function _safeTransferFrom(address from, address to, uint256 tokenID, bool registered, bytes memory data) internal {
        _transferFrom(from, to, tokenID, registered);
        if (to.isContract()) {
            if (!_checkOnERC721Received(msg.sender, from, to, tokenID, data)) {
                revert TransferRejected();
            }
        }
    }

    function _transferFrom(address from, address to, uint256 tokenID, bool /*registered */) internal virtual {
        // unchecked {
        // 	_balances[to]++;
        // 	if (registered) {
        // 		_balances[from]--;
        // 	}
        // }

        revert UsingGenericErrors.NotImplemented();

        // We encode the blockNumber in the token nonce. We can then use it for count voting.
        _owners[tokenID] = (block.number << 184) | uint256(uint160(to));
        Cell memory cell = _cells[uint64(tokenID)];
        if (_effectiveDelta(cell.delta, cell.enemyMap) > 0) {
            if (from != address(0)) {
                GENERATOR.remove(from, NUM_TOKENS_PER_GEMS);
            }
            if (to != address(0)) {
                GENERATOR.add(to, NUM_TOKENS_PER_GEMS);
            }
        }

        emit Transfer(from, to, tokenID);
    }

    /// @dev See approve.
    function _approveFor(address owner, uint256 nonce, address operator, uint256 tokenID) internal override {
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
    function _setApprovalForAll(address sender, address operator, bool approved) internal override {
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

    /// @dev Get the owner and operatorEnabled status of a token.
    /// @param tokenID The token to query.
    /// @return owner The owner of the token.
    /// @return operatorEnabled Whether or not operators are enabled for this token.
    function _ownerAndOperatorEnabledOf(
        uint256 tokenID
    ) internal view virtual returns (address owner, bool operatorEnabled) {
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
    function _ownerNonceAndOperatorEnabledOf(
        uint256 tokenID
    ) internal view virtual returns (address owner, uint256 nonce, bool operatorEnabled) {
        uint256 data = _owners[tokenID];
        owner = address(uint160(data));
        operatorEnabled = (data & OPERATOR_FLAG) == OPERATOR_FLAG;
        nonce = (data >> 160) & 0xFFFFFFFFFFFFFFFFFFFFFF;
    }

    function _svgURI(DisplayData memory data) internal pure returns (string memory) {
        return
            string.concat(
                "data:image/svg+xml,<svg%2520xmlns='http://www.w3.org/2000/svg'%2520viewBox='0%25200%2520512%2520512'><title>Island%2520",
                "(",
                data.x,
                ",",
                data.y,
                ")</title><rect%2520x='16'%2520y='16'%2520width='480'%2520height='480'%2520stroke='",
                data.factionColor,
                "'%2520stroke-width='3px'%2520fill='transparent'/><text%2520x='256'%2520y='256'%2520font-size='48px'%2520font-weight='bold'%2520fill='",
                data.factionColor,
                "'%2520dominant-baseline='middle'%2520text-anchor='middle'><tspan%2520x='256'%2520dy='-3.7em'>Island</tspan><tspan%2520x='256'%2520dy='1em'>(",
                data.x,
                ",",
                data.y,
                ")</tspan><tspan%2520x='256'%2520dy='2.2em'>Faction:%2520",
                data.factionName,
                "</tspan><tspan%2520x='256'%2520dy='1em'>Life:%2520",
                data.life,
                "</tspan><tspan%2520x='256'%2520dy='1em'>Growth:%2520",
                data.delta,
                "</tspan><tspan%2520x='256'%2520dy='2.3em'>Epoch%20",
                data.creationEpoch,
                "</tspan></text></svg>"
            );
    }

    function _factionDisplay(
        Color color
    ) internal pure returns (string memory factionName, string memory factionColor) {
        if (color == Color.None) {
            factionName = "None";
            factionColor = "gray";
        } else if (color == Color.Blue) {
            factionName = "Blue";
            factionColor = "blue";
        } else if (color == Color.Red) {
            factionName = "Red";
            factionColor = "red";
        } else if (color == Color.Green) {
            factionName = "Green";
            factionColor = "green";
        } else if (color == Color.Yellow) {
            factionName = "Yellow";
            factionColor = "yellow";
        } else if (color == Color.Purple) {
            factionName = "Purple";
            factionColor = "purple";
        } else if (color == Color.Evil) {
            factionName = "Evil";
            factionColor = "black";
        }
    }
}

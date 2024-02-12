// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "../interface/UsingStratagemsTypes.sol";

contract UsingStratagemsStore is UsingStratagemsTypes {
    mapping(uint256 => Cell) internal _cells;
    mapping(uint256 => uint256) internal _owners; //owner + approval + ... erc721

    mapping(address => uint256) internal _tokensInReserve;
    mapping(address => Commitment) internal _commitments;

    // Operators (also used by ERC721)
    mapping(address => mapping(address => bool)) internal _operatorsForAll;
    mapping(uint256 => address) internal _operators;

    // ERC721 balanceOf
    // mapping(address => uint256) internal _balances;
}

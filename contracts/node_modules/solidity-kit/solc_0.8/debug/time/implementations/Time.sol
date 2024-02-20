// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./UsingControlledTime.sol";
import "../../..//ERC173/implementations/Owned.sol";

contract Time is Owned, UsingControlledTime {
    constructor(address owner) Owned(owner) {}
}

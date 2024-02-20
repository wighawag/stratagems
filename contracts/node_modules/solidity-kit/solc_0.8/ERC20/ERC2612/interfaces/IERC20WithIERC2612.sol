// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../../interfaces/IERC20.sol";
import "./IERC2612.sol";

interface IERC20WithIERC2612 is IERC20, IERC2612 {}

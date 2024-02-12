// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

interface IGemsGenerator {
    /**
     * add points to an account
     * The points represent a share of point an account is participating
     * @param amount amount of points added
     * @param account account who is gaining points
     */
    function addPoints(uint256 amount, address account) external;

    /**
     * remove points from an account
     * @param amount aamount of points removed
     * @param account account who is losing points
     */
    function removePoints(uint256 amount, address account) external;
}

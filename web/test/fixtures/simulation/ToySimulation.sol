// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/// The second pattern (the sandbox's README): a function that seeds storage of
/// its own from its arguments and runs over it, as a simulation that replays a
/// game's unchanged, storage-heavy resolution does. It is not `view`, and
/// nothing it writes outlives the `eth_call` that runs it.
contract ToySimulation {
    mapping(uint256 => uint256) internal _stored;

    /// Writes `values` at `keys`, then adds up what is stored at `read`.
    function seededSum(
        uint256[] calldata keys,
        uint256[] calldata values,
        uint256[] calldata read
    ) external returns (uint256 sum) {
        for (uint256 i = 0; i < keys.length; i++) {
            _stored[keys[i]] = values[i];
        }
        for (uint256 i = 0; i < read.length; i++) {
            sum += _stored[read[i]];
        }
    }
}

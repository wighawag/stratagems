// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IERC5267 {
    /// @notice The return values of this function MUST describe the domain separator that is used for verification of EIP-712 signatures in the contract. They describe both the form of the EIP712Domain struct (i.e., which of the optional fields and extensions are present) and the value of each field, as follows.
    /// @return fields A bit map where bit i is set to 1 if and only if domain field i is present (0 ≤ i ≤ 4). Bits are read from least significant to most significant, and fields are indexed in the order that is specified by EIP-712, identical to the order in which they are listed in the function type.
    /// @return name EIP-712 name
    /// @return version EIP-712 version
    /// @return chainID EIP-712 chainID
    /// @return verifyingContract EIP-712 name verifyingContract
    /// @return salt EIP-712 salt
    /// @return extensions A list of EIP numbers that specify additional fields in the domain. The method to obtain the value for each of these additional fields and any conditions for inclusion are expected to be specified in the respective EIP. The value of fields does not affect their inclusion.
    function eip712Domain()
        external
        view
        returns (
            bytes1 fields,
            string memory name,
            string memory version,
            uint256 chainID,
            address verifyingContract,
            bytes32 salt,
            uint256[] memory extensions
        );
}

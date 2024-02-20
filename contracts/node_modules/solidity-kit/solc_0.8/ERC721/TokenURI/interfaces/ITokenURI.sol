// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITokenURI {
    /// @notice Returns the Uniform Resource Identifier (URI) for token `id`.
    /// @param tokenID the token to query
    function tokenURI(uint256 tokenID) external view returns (string memory);
}

interface IERC721WithExternalTokenURI is ITokenURI {
    /// @notice Triggered when the external tokenURI contract is updated/set.
    /// @param newTokenURIContract the new tokenURI contract
    event TokenURIContractSet(ITokenURI newTokenURIContract);
    /// @notice Triggered when the account in charge of tokenURI updates is updated/set.
    /// @param newTokenURIAdmin the new tokenURI admin
    event TokenURIAdminSet(address newTokenURIAdmin);

    /// @notice the contract that actually generate the sound (and all metadata via the a data: uri via tokenURI call).
    function tokenURIContract() external returns (ITokenURI);

    /// @notice tokenURIAdmin can update the tokenURI contract, this is intended to be relinquished once the tokenURI has been heavily tested in the wild and that no modification are needed.
    function tokenURIAdmin() external returns (address);

    /// @notice set the new tokenURIAdmin that can change the tokenURI
    /// Can only be called by the current tokenURI admin.
    function setTokenURIAdmin(address newTokenURIAdmin) external;

    /// @notice set a new tokenURI contract, that generate the metadata including the wav file, Can only be set by the `tokenURIAdmin`.
    /// @param newTokenURIContract The address of the new tokenURI contract.
    function setTokenURIContract(ITokenURI newTokenURIContract) external;
}

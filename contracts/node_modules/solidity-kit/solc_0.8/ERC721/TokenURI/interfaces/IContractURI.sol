// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IExternalContractURI {
    /// @notice Returns the Uniform Resource Identifier (URI) for the token collection.
    function contractURI(address receiver, uint96 per10Thousands) external view returns (string memory);
}

interface IContractURI {
    /// @notice Returns the Uniform Resource Identifier (URI) for the token collection.
    function contractURI() external view returns (string memory);
}

interface IERC721WithExternalContractURI is IContractURI {
    /// @notice Triggered when the external contractURI contract is updated/set.
    /// @param newContractURIAddress the contractURI contract
    event ContractURIAddressSet(IExternalContractURI newContractURIAddress);
    /// @notice Triggered when the account in charge of contractURI updates is updated/set.
    /// @param newContractURIAdmin the new contractURI admin
    event ContractURIAdminSet(address newContractURIAdmin);

    /// @notice the contract that return the contract metadata
    function contractURIAddress() external returns (IExternalContractURI);

    /// @notice contractURIAdmin can update the ContractURI contract, this is intended to be relinquished.
    function contractURIAdmin() external returns (address);

    /// @notice set the new contractURIAdmin that can change the contractURI
    /// Can only be called by the current contractURI admin.
    function setContractURIAdmin(address newContractURIAdmin) external;

    /// @notice set a new contractURI contract, that generate the metadata including the wav file, Can only be set by the `contractURIAdmin`.
    /// @param newContractURIAddress The address of the new contractURI contract.
    function setContractURI(IExternalContractURI newContractURIAddress) external;
}

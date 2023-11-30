---
outline: deep
---
# Time



## Functions

### **owner**

Get the address of the owner

*sig hash*: `0x8da5cb5b`

*Signature*: owner()

function owner() view returns (address)

### **transferOwnership**

Set the address of the new owner of the contract

*sig hash*: `0xf2fde38b`

*Signature*: transferOwnership(address)

function transferOwnership(address newOwner)

| Name | Description 
| ---- | ----------- 
| newOwner | The address of the new owner of the contract

### **withdrawERC20**

withdraw the total balance of a particular ERC20 token owned by this contract.

*sig hash*: `0x9456fbcc`

*Signature*: withdrawERC20(address,address)

function withdrawERC20(address token, address to)

| Name | Description 
| ---- | ----------- 
| token | ERC20 contract address to withdraw
| to | address that will receive the tokens


## Events

### **OwnershipTransferred**

This emits when ownership of the contract changes.

event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)

| Name | Description 
| ---- | ----------- 
| previousOwner | the previous owner
| newOwner | the new owner


## Errors

### **NotAuthorized**

Not authorized to perform this operation


error NotAuthorized()


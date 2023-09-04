---
outline: deep
---
# TestTokens



## Functions

### **DOMAIN_SEPARATOR**

EIP-712 Domain separator hash

*sig hash*: `0x3644e515`

*Signature*: DOMAIN_SEPARATOR()

function DOMAIN_SEPARATOR() view returns (bytes32)

### **allowance**

Returns the amount which `spender` is still allowed to withdraw from `owner`.

*sig hash*: `0xdd62ed3e`

*Signature*: allowance(address,address)

function allowance(address owner, address spender) view returns (uint256)

### **approve**

Allows `spender` to withdraw from your account multiple times, up to `amount`.

*sig hash*: `0x095ea7b3`

*Signature*: approve(address,uint256)

function approve(address spender, uint256 amount) returns (bool)

### **approveAndCall**

approve `amount` token to be spent by `spender` and callback into it via `onTokenApproval`

*sig hash*: `0xcae9ca51`

*Signature*: approveAndCall(address,uint256,bytes)

function approveAndCall(address spender, uint256 amount, bytes data) returns (bool)

| Name | Description 
| ---- | ----------- 
| spender | account to send the token for
| amount | number of token to transfer
| data | extra data

### **balanceOf**

Returns the account balance of another account with address `owner`.

*sig hash*: `0x70a08231`

*Signature*: balanceOf(address)

function balanceOf(address owner) view returns (uint256)

### **decimals**

Returns the number of decimals the token uses.

*sig hash*: `0x313ce567`

*Signature*: decimals()

function decimals() pure returns (uint8)

### **distributeAlongWithETH**

distribute

*sig hash*: `0x0e02df54`

*Signature*: distributeAlongWithETH(address[],uint256)

function distributeAlongWithETH(address[] tos, uint256 totalAmount) payable returns (bool)

### **eip712Domain**

The return values of this function MUST describe the domain separator that is used for verification of EIP-712 signatures in the contract. They describe both the form of the EIP712Domain struct (i.e., which of the optional fields and extensions are present) and the value of each field, as follows.

*sig hash*: `0x84b0196e`

*Signature*: eip712Domain()

function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainID, address verifyingContract, bytes32 salt, uint256[] extensions)

### **nonces**

return the current nonce of the owner

*sig hash*: `0x7ecebe00`

*Signature*: nonces(address)

function nonces(address owner) view returns (uint256)

| Name | Description 
| ---- | ----------- 
| owner | address queried

### **permit**

allow `spender` to spend `value` amount of token on behalf of `owner`

*sig hash*: `0xd505accf`

*Signature*: permit(address,address,uint256,uint256,uint8,bytes32,bytes32)

function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)

| Name | Description 
| ---- | ----------- 
| owner | owner of the tokens
| spender | address allowed to spend on behalf of the owner.
| value | amount of token allowed to be spent
| deadline | timestamp in seconds after which the permit is not valid.
| v | signature part v
| r | signature part r
| s | signature part s

### **symbol**

Returns the symbol of the token.

*sig hash*: `0x95d89b41`

*Signature*: symbol()

function symbol() view returns (string)

### **totalSupply**

Returns the total token supply.

*sig hash*: `0x18160ddd`

*Signature*: totalSupply()

function totalSupply() view returns (uint256)

### **transfer**

Transfers `amount` of tokens to address `to`.

*sig hash*: `0xa9059cbb`

*Signature*: transfer(address,uint256)

function transfer(address to, uint256 amount) returns (bool)

### **transferAlongWithETH**

transfer

*sig hash*: `0xe7fcb065`

*Signature*: transferAlongWithETH(address,uint256)

function transferAlongWithETH(address to, uint256 amount) payable returns (bool)

### **transferAndCall**

transfer `amount` token to `to` and callback into it via `onTokenTransfer`

*sig hash*: `0x4000aea0`

*Signature*: transferAndCall(address,uint256,bytes)

function transferAndCall(address to, uint256 amount, bytes data) returns (bool)

| Name | Description 
| ---- | ----------- 
| to | account to receive the tokens
| amount | number of token to transfer
| data | extra data

### **transferFrom**

Transfers `amount` tokens from address `from` to address `to`.

*sig hash*: `0x23b872dd`

*Signature*: transferFrom(address,address,uint256)

function transferFrom(address from, address to, uint256 amount) returns (bool)

### **transferFromAndCall**

transfer `amount` token to `to` and callback into it via `onTokenTransfer`

*sig hash*: `0xc1d34b89`

*Signature*: transferFromAndCall(address,address,uint256,bytes)

function transferFromAndCall(address from, address to, uint256 amount, bytes data) returns (bool)

| Name | Description 
| ---- | ----------- 
| from | account to send the token from
| to | account to receive the tokens
| amount | number of token to transfer
| data | extra data

### **transferOnBehalfAndCall**

transfer `amount` token to `to` and callback into it via `onTokenTransferedOnBehalf`

*sig hash*: `0x65520efa`

*Signature*: transferOnBehalfAndCall(address,address,uint256,bytes)

function transferOnBehalfAndCall(address forAddress, address to, uint256 amount, bytes data) returns (bool)

| Name | Description 
| ---- | ----------- 
| forAddress | account to send the token for
| to | account to receive the tokens
| amount | number of token to transfer
| data | extra data


## Events

### **Approval**

trigger on approval amount being set.   Note that Transfer events need to be considered to compute the current allowance.

event Approval(address indexed owner, address indexed spender, uint256 value)

| Name | Description 
| ---- | ----------- 
| owner | the account approving the `spender`
| spender | the account allowed to spend
| value | the amount granted

### **Transfer**

trigger when tokens are transferred, including zero value transfers.

event Transfer(address indexed from, address indexed to, uint256 value)

| Name | Description 
| ---- | ----------- 
| from | the account the tokens are sent from
| to | the account the tokens are sent to
| value | number of tokens sent


## Errors

### **DeadlineOver**

The permit has expired


error DeadlineOver(uint256 currentTime, uint256 deadline)

| Name | Description 
| ---- | ----------- 
| currentTime | time at which the error happen
| deadline | the deadline

### **InvalidAddress**

An invalid address is specified (for example: zero address)


error InvalidAddress(address addr)

| Name | Description 
| ---- | ----------- 
| addr | invalid address

### **InvalidMsgValue**

The msg value do not match the expected value


error InvalidMsgValue(uint256 provided, uint256 expected)

| Name | Description 
| ---- | ----------- 
| provided | msg.value amount provided
| expected | value expected

### **InvalidSignature**

The signature do not match the expected signer


error InvalidSignature()

### **InvalidTotalAmount**

The total amount provided do not match the expected value


error InvalidTotalAmount(uint256 provided, uint256 expected)

| Name | Description 
| ---- | ----------- 
| provided | msg.value amount provided
| expected | value expected

### **NotAuthorizedAllowance**

the amount requested exceed the allowance


error NotAuthorizedAllowance(uint256 currentAllowance, uint256 expected)

| Name | Description 
| ---- | ----------- 
| currentAllowance | the current allowance
| expected | amount expected

### **NotEnoughTokens**

the amount requested exceed the balance


error NotEnoughTokens(uint256 currentBalance, uint256 expected)

| Name | Description 
| ---- | ----------- 
| currentBalance | the current balance
| expected | amount expected


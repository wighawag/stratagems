---
outline: deep
---
# GemsGenerator



## Functions

### **allowance**

Returns the amount which `spender` is still allowed to withdraw from `owner`.

*sig hash*: `0xdd62ed3e`

*Signature*: allowance(address,address)

function allowance(address, address) pure returns (uint256)

### **approve**

Allows `spender` to withdraw from your account multiple times, up to `amount`.

*sig hash*: `0x095ea7b3`

*Signature*: approve(address,uint256)

function approve(address, uint256) pure returns (bool)

### **balanceOf**

Returns the account balance of another account with address `owner`.

*sig hash*: `0x70a08231`

*Signature*: balanceOf(address)

function balanceOf(address owner) view returns (uint256)

### **claimFixedRewards**

claim the rewards earned so far using a fixed rate per point

*sig hash*: `0x066112f9`

*Signature*: claimFixedRewards(address)

function claimFixedRewards(address to)

| Name | Description 
| ---- | ----------- 
| to | address to send the reward to

### **claimSharedPoolRewards**

claim the rewards earned so far in the shared pool

*sig hash*: `0xff1e03e9`

*Signature*: claimSharedPoolRewards(address)

function claimSharedPoolRewards(address to)

| Name | Description 
| ---- | ----------- 
| to | address to send the reward to

### **decimals**

Returns the number of decimals the token uses.

*sig hash*: `0x313ce567`

*Signature*: decimals()

function decimals() pure returns (uint8)

### **earnedFromFixedRate**

The amount of reward an account has accrued so far. Does not include already withdrawn rewards.

*sig hash*: `0xa8671f6a`

*Signature*: earnedFromFixedRate(address)

function earnedFromFixedRate(address account) view returns (uint256)

| Name | Description 
| ---- | ----------- 
| account | address to query about

### **earnedFromFixedRateMultipleAccounts**

The amount of reward an account has accrued so far. Does not include already withdrawn rewards.

*sig hash*: `0x7997f96d`

*Signature*: earnedFromFixedRateMultipleAccounts(address[])

function earnedFromFixedRateMultipleAccounts(address[] accounts) view returns (uint256[] result)

| Name | Description 
| ---- | ----------- 
| accounts | list of address to query about

### **earnedFromPoolRate**

The amount of reward an account has accrued so far. Does not include already withdrawn rewards.

*sig hash*: `0xb061963c`

*Signature*: earnedFromPoolRate(address)

function earnedFromPoolRate(address account) view returns (uint256)

| Name | Description 
| ---- | ----------- 
| account | address to query about

### **earnedFromPoolRateMultipleAccounts**

The amount of reward an account has accrued so far. Does not include already withdrawn rewards.

*sig hash*: `0x59d431b3`

*Signature*: earnedFromPoolRateMultipleAccounts(address[])

function earnedFromPoolRateMultipleAccounts(address[] accounts) view returns (uint256[] result)

| Name | Description 
| ---- | ----------- 
| accounts | list of address to query about

### **enableGame**

Allow a contract (a game) to add points to the rewards system

*sig hash*: `0x16cf09f8`

*Signature*: enableGame(address,uint256)

function enableGame(address game, uint256 weight)

| Name | Description 
| ---- | ----------- 
| game | the contract that is allowed to call in
| weight | (not implemented, act as boolean for now) (0 disable the game)

### **games**

return the weight of the game

*sig hash*: `0x79131a19`

*Signature*: games(address)

function games(address game) view returns (uint256 weight)

| Name | Description 
| ---- | ----------- 
| game | the contract to query about

### **getTotalRewardPerPointWithPrecision24**

The amount of reward each point has earned so far

*sig hash*: `0x48483382`

*Signature*: getTotalRewardPerPointWithPrecision24()

function getTotalRewardPerPointWithPrecision24() view returns (uint256)

### **global**

return the current global state

*sig hash*: `0xa05f9906`

*Signature*: global()

function global() view returns ((uint40 lastUpdateTime, uint104 totalRewardPerPointAtLastUpdate, uint112 totalPoints))

### **name**

Returns the name of the token.

*sig hash*: `0x06fdde03`

*Signature*: name()

function name() pure returns (string)

### **symbol**

Returns the symbol of the token.

*sig hash*: `0x95d89b41`

*Signature*: symbol()

function symbol() pure returns (string)

### **totalSupply**

Returns the total token supply.

*sig hash*: `0x18160ddd`

*Signature*: totalSupply()

function totalSupply() view returns (uint256)

### **transfer**

Transfers `amount` of tokens to address `to`.

*sig hash*: `0xa9059cbb`

*Signature*: transfer(address,uint256)

function transfer(address, uint256) pure returns (bool)

### **transferFrom**

Transfers `amount` tokens from address `from` to address `to`.

*sig hash*: `0x23b872dd`

*Signature*: transferFrom(address,address,uint256)

function transferFrom(address, address, uint256) pure returns (bool)

### **update**

update the global pool rate

*sig hash*: `0xa2e62045`

*Signature*: update()

function update()


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

### **NonTransferable**

Token cannot be transfered


error NonTransferable()

### **NotAuthorized**

Not authorized to perform this operation


error NotAuthorized()


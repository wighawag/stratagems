---
outline: deep
---
# Stratagems



## Functions

### **acknowledgeMissedResolution**

called by player if they missed the resolution phase and want to minimze the token loss.  By providing the moves, they will be slashed only the amount of token required to make the moves

*sig hash*: `0x81ca54b9`

*Signature*: acknowledgeMissedResolution(address,bytes32,(uint64,uint8)[],bytes24)

function acknowledgeMissedResolution(address player, bytes32 secret, tuple(uint64 position, uint8 color)[] moves, bytes24 furtherMoves)

| Name | Description 
| ---- | ----------- 
| player | the account who committed the move
| secret | the secret used to make the commit
| moves | the actual moves
| furtherMoves | if moves cannot be contained in one tx, further moves are represented by a hash to resolve too

### **acknowledgeMissedResolutionByBurningAllReserve**

should only be called as last resort this will burn all tokens in reserve If player has access to the secret, better call `acknowledgeMissedResolution`

*sig hash*: `0x24a27240`

*Signature*: acknowledgeMissedResolutionByBurningAllReserve()

function acknowledgeMissedResolutionByBurningAllReserve()

### **addToReserve**

called by players to add tokens to their reserve

*sig hash*: `0xd6710112`

*Signature*: addToReserve(uint256,(uint256,uint256,uint8,bytes32,bytes32))

function addToReserve(uint256 tokensAmountToAdd, tuple(uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) permit)

| Name | Description 
| ---- | ----------- 
| tokensAmountToAdd | amount of tokens to add
| permit | permit EIP2612, .value = zero if not needed

### **cancelCommitment**

called by players to cancel their current commitment  Can only be called during the commit phase in which the commitment was made  It cannot be called afterward

*sig hash*: `0xafa1e2d1`

*Signature*: cancelCommitment()

function cancelCommitment()

### **getCell**

return updated cell (based on current epoch)

*sig hash*: `0x206848f6`

*Signature*: getCell(uint256)

function getCell(uint256 id) view returns (tuple(address owner, uint24 lastEpochUpdate, uint24 epochWhenTokenIsAdded, uint8 color, uint8 life, int8 delta, uint8 enemyMap, uint8 distribution))

| Name | Description 
| ---- | ----------- 
| id | the cell id

### **getCells**

return the list of updated cells (based on current epoch) whose ids is given

*sig hash*: `0xf18885ce`

*Signature*: getCells(uint256[])

function getCells(uint256[] ids) view returns (tuple(address owner, uint24 lastEpochUpdate, uint24 epochWhenTokenIsAdded, uint8 color, uint8 life, int8 delta, uint8 enemyMap, uint8 distribution)[] cells)

| Name | Description 
| ---- | ----------- 
| ids | the list of cell ids

### **getCommitment**

The commitment to be resolved. zeroed if no commitment need to be made.

*sig hash*: `0xfa1026dd`

*Signature*: getCommitment(address)

function getCommitment(address account) view returns (tuple(bytes24 hash, uint24 epoch) commitment)

| Name | Description 
| ---- | ----------- 
| account | the address of which to retrieve the commitment

### **getConfig**

return the config used to initialise the Game

*sig hash*: `0xc3f909d4`

*Signature*: getConfig()

function getConfig() view returns (tuple(address tokens, address burnAddress, uint256 startTime, uint256 commitPhaseDuration, uint256 resolutionPhaseDuration, uint8 maxLife, uint256 numTokensPerGems) config)

### **getTokensInReserve**

the number of token in reserve per account  This is used to slash player who do not resolve their commit  The amount can be greater than the number of token required for the next move  This allow player to potentially hide their intention.

*sig hash*: `0x990b0509`

*Signature*: getTokensInReserve(address)

function getTokensInReserve(address account) view returns (uint256 amount)

| Name | Description 
| ---- | ----------- 
| account | the address to retrived the amount in reserve of.

### **makeCommitment**

called by players to commit their moves  this can be called multiple time in the same epoch, the last call overriding the previous.  When a commitment is made, it needs to be resolved in the resolution phase of the same epoch.abi  If missed, player can still reveal its moves but none of them will be resolved.   The player would lose its associated reserved amount.

*sig hash*: `0xb3015773`

*Signature*: makeCommitment(bytes24)

function makeCommitment(bytes24 commitmentHash)

| Name | Description 
| ---- | ----------- 
| commitmentHash | the hash of the moves

### **makeCommitmentWithExtraReserve**

called to make a commitment along with tokens to add to the reserve

*sig hash*: `0xc0e75387`

*Signature*: makeCommitmentWithExtraReserve(bytes24,uint256,(uint256,uint256,uint8,bytes32,bytes32))

function makeCommitmentWithExtraReserve(bytes24 commitmentHash, uint256 tokensAmountToAdd, tuple(uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) permit)

| Name | Description 
| ---- | ----------- 
| commitmentHash | the has of the moves
| tokensAmountToAdd | amount of tokens to add to the reserve. the resulting total must be enough to cover the moves
| permit | permit EIP2612, value = zero if not needed

### **pokeMultiple**

poke and collect the tokens won across multiple cells

*sig hash*: `0x8b8fc3a1`

*Signature*: pokeMultiple(uint64[])

function pokeMultiple(uint64[] positions)

| Name | Description 
| ---- | ----------- 
| positions | cell positions to collect from

### **resolve**

called by player to resolve their commitment  this is where the core logic of the game takes place  This is where the game board evolves  The game is designed so that resolution order do not matter

*sig hash*: `0x145165a9`

*Signature*: resolve(address,bytes32,(uint64,uint8)[],bytes24,bool)

function resolve(address player, bytes32 secret, tuple(uint64 position, uint8 color)[] moves, bytes24 furtherMoves, bool useReserve)

| Name | Description 
| ---- | ----------- 
| player | the account who committed the move
| secret | the secret used to make the commit
| moves | the actual moves
| furtherMoves | if moves cannot be contained in one tx, further moves are represented by a hash to resolve too  Note that you have to that have enough moves (specified by MAX_NUM_MOVES_PER_HASH = 32)
| useReserve | whether the tokens are taken from the reserve or from approvals.  This allow player to keep their reserve intact and use it on their next move.  Note that this require the Stratagems contract to have enough allowance.

### **withdrawFromReserve**

called by players to withdraw tokens from the reserve  can only be called if no commitments are pending  Note that while you can withdraw after commiting, note that if you do not have enough tokens  you'll have your commitment failing.

*sig hash*: `0x0a8bcdb9`

*Signature*: withdrawFromReserve(uint256)

function withdrawFromReserve(uint256 amount)

| Name | Description 
| ---- | ----------- 
| amount | number of tokens to withdraw

### **approve**

Approve an operator to transfer a specific token on the senders behalf.

*sig hash*: `0x095ea7b3`

*Signature*: approve(address,uint256)

function approve(address operator, uint256 tokenID)

| Name | Description 
| ---- | ----------- 
| operator | The address receiving the approval.
| tokenID | The id of the token.

### **balanceOf**

balanceOf is not implemented, keeping track of this add gas and we did not consider that worth it

*sig hash*: `0x70a08231`

*Signature*: balanceOf(address)

function balanceOf(address) pure returns (uint256)

### **getApproved**

Get the approved operator for a specific token.

*sig hash*: `0x081812fc`

*Signature*: getApproved(uint256)

function getApproved(uint256 tokenID) view returns (address operator)

| Name | Description 
| ---- | ----------- 
| tokenID | The id of the token.

### **isApprovedForAll**

Check if the sender approved the operator to transfer any of its tokens.

*sig hash*: `0xe985e9c5`

*Signature*: isApprovedForAll(address,address)

function isApprovedForAll(address owner, address operator) view returns (bool)

| Name | Description 
| ---- | ----------- 
| owner | The address of the owner.
| operator | The address of the operator.

### **name**

A descriptive name for a collection of NFTs in this contract

*sig hash*: `0x06fdde03`

*Signature*: name()

function name() pure returns (string)

### **ownerAndLastTransferBlockNumberList**

Get the list of owner of a token and the blockNumber of its last transfer, useful to voting mechanism.

*sig hash*: `0xf3945282`

*Signature*: ownerAndLastTransferBlockNumberList(uint256[])

function ownerAndLastTransferBlockNumberList(uint256[] tokenIDs) view returns (tuple(address owner, uint256 lastTransferBlockNumber)[] ownersData)

| Name | Description 
| ---- | ----------- 
| tokenIDs | The list of token ids to check.

### **ownerAndLastTransferBlockNumberOf**

Get the owner of a token and the blockNumber of the last transfer, useful to voting mechanism.

*sig hash*: `0x48f3c51c`

*Signature*: ownerAndLastTransferBlockNumberOf(uint256)

function ownerAndLastTransferBlockNumberOf(uint256 tokenID) view returns (address owner, uint256 blockNumber)

| Name | Description 
| ---- | ----------- 
| tokenID | The id of the token.

### **ownerOf**

Get the owner of a token.

*sig hash*: `0x6352211e`

*Signature*: ownerOf(uint256)

function ownerOf(uint256 tokenID) view returns (address owner)

| Name | Description 
| ---- | ----------- 
| tokenID | The id of the token.

### **safeTransferFrom**

Transfer a token between 2 addresses letting the receiver know of the transfer.

*sig hash*: `0x42842e0e`

*Signature*: safeTransferFrom(address,address,uint256)

function safeTransferFrom(address from, address to, uint256 tokenID)

| Name | Description 
| ---- | ----------- 
| from | The send of the token.
| to | The recipient of the token.
| tokenID | The id of the token.

### **safeTransferFrom**

Transfer a token between 2 addresses letting the receiver knows of the transfer.

*sig hash*: `0x42842e0e`

*Signature*: safeTransferFrom(address,address,uint256,bytes)

function safeTransferFrom(address from, address to, uint256 tokenID)

| Name | Description 
| ---- | ----------- 
| from | The sender of the token.
| to | The recipient of the token.
| tokenID | The id of the token.

### **setApprovalForAll**

Set the approval for an operator to manage all the tokens of the sender.

*sig hash*: `0xa22cb465`

*Signature*: setApprovalForAll(address,bool)

function setApprovalForAll(address operator, bool approved)

| Name | Description 
| ---- | ----------- 
| operator | The address receiving the approval.
| approved | The determination of the approval.

### **supportsInterface**

Query if a contract implements an interface

*sig hash*: `0x01ffc9a7`

*Signature*: supportsInterface(bytes4)

function supportsInterface(bytes4 interfaceID) pure returns (bool)

| Name | Description 
| ---- | ----------- 
| interfaceID | The interface identifier, as specified in ERC-165

### **symbol**

An abbreviated name for NFTs in this contract

*sig hash*: `0x95d89b41`

*Signature*: symbol()

function symbol() pure returns (string)

### **tokenURI**

A distinct Uniform Resource Identifier (URI) for a given asset.

*sig hash*: `0xc87b56dd`

*Signature*: tokenURI(uint256)

function tokenURI(uint256 tokenID) view returns (string)

| Name | Description 
| ---- | ----------- 
| tokenID | id of the token being queried.

### **transferFrom**

Transfer a token between 2 addresses.

*sig hash*: `0x23b872dd`

*Signature*: transferFrom(address,address,uint256)

function transferFrom(address from, address to, uint256 tokenID)

| Name | Description 
| ---- | ----------- 
| from | The sender of the token.
| to | The recipient of the token.
| tokenID | The id of the token.


## Events

### **CommitmentCancelled**

A player has cancelled its current commitment (before it reached the resolution phase)

event CommitmentCancelled(address indexed player, uint24 indexed epoch)

| Name | Description 
| ---- | ----------- 
| player | account taking the staking risk (can be a different account than the one controlling the gems)
| epoch | epoch number on which this commit belongs to

### **CommitmentMade**

A player has commited to make a move and resolve it on the resolution phase

event CommitmentMade(address indexed player, uint24 indexed epoch, bytes24 commitmentHash)

| Name | Description 
| ---- | ----------- 
| player | account taking the staking risk (can be a different account than the one controlling the gems)
| epoch | epoch number on which this commit belongs to
| commitmentHash | the hash of moves

### **CommitmentResolved**

Player has resolved its previous commitment

event CommitmentResolved(address indexed player, uint24 indexed epoch, bytes24 indexed commitmentHash, tuple(uint64 position, uint8 color)[] moves, bytes24 furtherMoves, uint256 newReserveAmount)

| Name | Description 
| ---- | ----------- 
| player | account who commited
| epoch | epoch number on which this commit belongs to
| commitmentHash | the hash of the moves
| moves | the moves
| furtherMoves | hash of further moves, unless bytes32(0) which indicate end.

### **CommitmentVoid**

A player has canceled a previous commitment by burning some tokens

event CommitmentVoid(address indexed player, uint24 indexed epoch, uint256 amountBurnt, bytes24 furtherMoves)

| Name | Description 
| ---- | ----------- 
| player | the account that made the commitment
| epoch | epoch number on which this commit belongs to
| amountBurnt | amount of token to burn
| furtherMoves | hash of further moves, unless bytes32(0) which indicate end.

### **MoveProcessed**

A move has been resolved.

event MoveProcessed(uint64 indexed position, address indexed player, uint8 oldColor, uint8 newColor)

| Name | Description 
| ---- | ----------- 
| position | cell at which the move take place
| player | account making the move
| oldColor | previous color of the cell
| newColor | color that takes over

### **ReserveDeposited**

Player has deposited token in the reserve, allowing it to use that much in game

event ReserveDeposited(address indexed player, uint256 amountDeposited, uint256 newAmount)

| Name | Description 
| ---- | ----------- 
| player | account receiving the token in the reserve
| amountDeposited | the number of tokens deposited
| newAmount | the number of tokens in reserver as a result

### **ReserveWithdrawn**

Player have withdrawn token from the reserve

event ReserveWithdrawn(address indexed player, uint256 amountWithdrawn, uint256 newAmount)

| Name | Description 
| ---- | ----------- 
| player | account withdrawing the tokens
| amountWithdrawn | the number of tokens withdrawnn
| newAmount | the number of tokens in reserver as a result

### **Approval**

Triggered when a token is approved to be sent by another account  Note tat the approval get reset when a Transfer event for that same token is emitted.

event Approval(address indexed owner, address indexed approved, uint256 indexed tokenID)

| Name | Description 
| ---- | ----------- 
| owner | current owner of the token
| approved | account who can know transfer on the owner's behalf
| tokenID | id of the token being approved

### **ApprovalForAll**

Triggered when an account approve or disaprove another to transfer on its behalf

event ApprovalForAll(address indexed owner, address indexed operator, bool approved)

| Name | Description 
| ---- | ----------- 
| owner | the account granting rights over all of its token
| operator | account who can know transfer on the owner's behalf
| approved | whether it is approved or not

### **Transfer**

Triggered when a token is transferred

event Transfer(address indexed from, address indexed to, uint256 indexed tokenID)

| Name | Description 
| ---- | ----------- 
| from | the account the token is sent from
| to | the account the token is sent to
| tokenID | id of the token being sent


## Errors

### **CanStillResolve**

Player have to resolve if they can Stratagems will prevent them from acknowledging missed resolution if there is still time to resolve.


error CanStillResolve()

### **CommitmentHashNotMatching**

Player have to reveal their commitment using the exact same move values  If they provide different value, the commitment hash will differ and Stratagems will reject their resolution.


error CommitmentHashNotMatching()

### **GameNotStarted**

Game has not started yet, can't perform any action


error GameNotStarted()

### **InCommitmentPhase**

When in Commit phase, player can make new commitment but they cannot resolve their move yet.


error InCommitmentPhase()

### **InResolutionPhase**

When in Resolution phase, it is not possible to commit new moves or cancel previous commitment  During Resolution phase, players have to reveal their commitment, if not already done.


error InResolutionPhase()

### **InvalidEpoch**

Player can only resolve their move in the same epoch they commited.abi  If a player resolve later it can only do to minimize the reserve burn cost by calling : `acknowledgeMissedResolution`


error InvalidEpoch()

### **InvalidFurtherMoves**

Player can make arbitrary number of moves per epoch. To do so they group moves into (MAX_NUM_MOVES_PER_HASH = 32) moves  This result in a recursive series of hash that they can then submit in turn while resolving.  The limit  (MAX_NUM_MOVES_PER_HASH = 32) ensure a resolution batch fits in a block.


error InvalidFurtherMoves()

### **NothingToResolve**

Player can only resolve moves they commited.


error NothingToResolve()

### **PreviousCommitmentNotResolved**

Previous commitment need to be resolved before making a new one. Even if the corresponding reveal phase has passed.

  It is also not possible to withdraw any amount from reserve until the commitment is revealed.

If player lost the information to reveal, it can acknowledge failure which will burn all its reserve.


error PreviousCommitmentNotResolved()

### **ReserveTooLow**

to make a commitment you always need at least one `config.numTokensPerGems` amount in reserve  Player also need one `config.numTokensPerGems`  per moves during the resolution phase.


error ReserveTooLow(uint256 inReserve, uint256 expected)

| Name | Description 
| ---- | ----------- 
| inReserve | amount in reserver as the time of the call
| expected | amount required to proceed

### **InvalidAddress**

An invalid address is specified (for example: zero address)


error InvalidAddress(address addr)

| Name | Description 
| ---- | ----------- 
| addr | invalid address

### **NonExistentToken**

The token does not exist


error NonExistentToken(uint256 tokenID)

| Name | Description 
| ---- | ----------- 
| tokenID | id of the expected token

### **NonceOverflow**

The Nonce overflowed, make a transfer to self to allow new nonces.


error NonceOverflow()

### **NotAuthorized**

Not authorized to perform this operation


error NotAuthorized()

### **NotOwner**

The address from which the token is sent is not the current owner


error NotOwner(address provided, address currentOwner)

| Name | Description 
| ---- | ----------- 
| provided | the address expected to be the current owner
| currentOwner | the current owner

### **TransferRejected**

The Transfer was rejected by the destination


error TransferRejected()


# Stratagems_Implementation_route_Core



## acknowledgeMissedResolution(address,bytes32,(uint64,uint8)[],bytes24)

called by player if they missed the resolution phase and want to minimze the token loss  By providing the moves, they will be slashed only the amount of token required to make the moves

furtherMoves:if moves cannot be contained in one tx, further moves are represented by a hash to resolve too

moves:the actual moves

player:the account who committed the move

secret:the secret used to make the commit

## acknowledgeMissedResolutionByBurningAllReserve()

should only be called as last resort this will burn all tokens in reserve If player has access to the secret, better call acknowledgeMissedResolution

## addToReserve(uint256,(uint256,uint256,uint8,bytes32,bytes32))

called by players to add tokens to their reserve

permit:permit EIP2612, .value = zero if not needed

tokensAmountToAdd:amount of tokens to add

## cancelCommitment()

called by players to cancel their current commitment  Can only be called during the commit phase in which the commitment was made  It cannot be called afterward

## getCell(uint256)

return updated cell (based on current epoch)

id:the cell id

## getCells(uint256[])

return the list of updated cells (based on current epoch) whose ids is given

ids:the list of cell ids

## getCommitment(address)

The commitment to be resolved. zeroed if no commitment need to be made.

account:the address of which to retrieve the commitment

## getConfig()

return the config used to initialise the Game

## getTokensInReserve(address)

the number of token in reserve per account  This is used to slash player who do not resolve their commit  The amount can be greater than the number of token required for the next move  This allow player to potentially hide their intention.

account:the address to retrived the amount in reserve of.

## makeCommitment(bytes24)

called by players to commit their moves  this can be called multiple time, the last call overriding the previous.

commitmentHash:the hash of the moves

## makeCommitmentWithExtraReserve(bytes24,uint256,(uint256,uint256,uint8,bytes32,bytes32))

called to make a commitment along with tokens to add to the reserve

commitmentHash:the has of the moves

permit:permit EIP2612, value = zero if not needed

tokensAmountToAdd:amount of tokens to add to the reserve. the resulting total must be enough to cover the moves

## poke(uint64)

poke a position, resolving its virtual state and if dead, reward neighboor enemies colors

position:the cell position

## pokeMultiple(uint64[])

poke and collect the tokens won

positions:cell positions to collect from

## resolve(address,bytes32,(uint64,uint8)[],bytes24,bool)

called by player to resolve their commitment  this is where the core logic of the game takes place  This is where the game board evolves  The game is designed so that resolution order do not matter

furtherMoves:if moves cannot be contained in one tx, further moves are represented by a hash to resolve too  Note that you have to that number of mvoes

moves:the actual moves

player:the account who committed the move

secret:the secret used to make the commit

useReserve:whether the tokens are taken from the reserve or from approvals

## withdrawFromReserve(uint256)

called by players to withdraw tokens from the reserve  can only be called if no commitments are pending  Note that while you can withdraw after commiting, note that if you do not have enough tokens  you'll have your commitment failing.

amount:number of tokens to withdraw


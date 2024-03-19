# Extending the world

Stratagems is designed to be extended and has no bound on how this can be done. It does not follow traditional fixed API to hooks into. Rather it expose a set of output that can be used by other games which in turn expand the possibilities for players. We call this "Natural Composability" because like nature, it is present whether you want it or not, and no particular entity has control over it. We describe it in more details in our article ["Natural Composability"](https://etherplay.io/blog/natural-composability/).

So what output does Stratagems expose ?

## Stratagems States

We document all our smart contracts [here](/contracts/Stratagems/).

The main data points exposed are that of the world map, composed of Lands.

Each Land have the following attributes:

- `uint24 producingEpochs`: number of epoch the land has grown so far
- `Color color`: the faction inhabiting that Land
- `uint8 life`: the number of life the land has (between 0 (dead) to 7 (max))
- `int8 delta`: whether the land is gaining life or losing life due to its neighboroud
- `address owner`: the owner of land, the player who deposited a stake to choose a faction

The `producingEpochs` is particularly useful to track whether a Land has been growing since you can use to track it even if your game transaction happen later.

This can be used for example to make a game where Land produce units as long as growth of the land is positive.

This can lead to very interesting social interaction between players of the base game and the one playing the extended game.

You can of course also creating incentives mechanism to attract player of the base game.

Stratagems has its own token: Gems, which does not have any role in the base game but is given to player whose land is propsering. Gems is thus a great token to integrate.

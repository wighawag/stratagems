# Introduction

In Stratagems, players are actual gods. They are the one creating the world island after island. They do so by depositing some ETH while deciding which factions will be in charge of that land. Other player will do the same and different factions will fight for the control of world. As aresult of this, player will be able to capture the ETH from the other player depending on the outcome.

Stratagems is thus at its core a social game of coordination. It takes place on an infinite world where the factions inhabiting that land decide the fate of the game world. Each day players stake a small amount of ETH for each land they want to own. The next day they discover whether their stratagy was wise. The social elements quickly comes into play as who knows the other's moves get an advantages over those we do not.

But the game does not stop there. Stratagems is a world being created by each player's action and new mechanics can be added on top, giving infinite possibilities to its inhabitants.

# How to play ?

Right now, we are play-testing the game using [Backdrop Beta](https://backdropbeta.com/stratagems/join/tKbn9Mph) to gather feedback. Feel free to join in.

The interface is in constant evolution so the current guide might be out of date at short notice, but as it stand, the game work as follow:

The game has 2 phases: Commit and Reveal.

The commit phase last 23h and the reveal phase, 1 hour only.

> Currently for the test, the time will be accelerated to accomodate a more synchronous and fast gameplay among the participants.

Player needs to own some Test Tokens (Join our [discord](https://discord.gg/Qb4gr2ekfr) for this)

Once they get some, they can place island and their associated faction on the board by depositing 1 token on each land they want to place. They pick the faction by clicking on the land thus created. You can remove that land by clicking to rotate the selected faction until the land get reset.

Once you are happy with your moves, you can commit and wait for the reveal phase, which will then notify you to reveal your previous move.

if you missed on the resolution, your token get burnt.

Note that we are now integrating our third party service [FUZD](https://fuzd.dev) which will let you make the commit and let the reveal be done automatically. This has some security assumption that you might want to be aware of (see [FUZD](https://fuzd.dev)) but this should offer a far more compelling experience for players.

# The Rules

Stratagems takes place on an endless sea, represented as a blue grid. Actually it is bounded to some high mumber but in practise this does not matter.

The grid is composed of square cell, each having 4 neighbors. Diagonal does not count.

Each square cell can contains a faction / color.

At the start, all the cell are empty but as players play, it get filled with lands and building representing the factions.

There are only 6 factions, 5 owned by players and 1 owned by no-one, the evil faction.
 
For a player to place a land and the associated faction on the grid, they must deposit X token on the cell.

That cell must be empty or dead.

Player are not tied to a specific faction and can play any one of them as long as they have emough token.

When a player place a land/faction on the grid, they get ownership of it, except for the 6th faction who can never be owned by anyone.

If 2 or more players happen to place a island/faction on the same cell, the players still deposit their token but the cell becomes of the 6th faction and is owned by no-one. The deposit remains available for capture though and players are still free to put more faction on the grid to capture the deposit back.

Land thus created starts with 1 life and grows depending on their neighbours.

when a land has no neighbor, the land's life do not grow

When a land has only neihbor of the same faction, its life grows by that number every day.

When a land has only neighbor of different faction its life decrease by that number

When there are both same-faction and diferent faction neighbord, its life decrease by the difference betweent the 2 numbers

If the number of same-faction neighbor is equal to the number of different-faction neighbor, its life decrease by one

When life reaches zero, the land dies and loses its gems. When that happens, the land and the faction remains active on the grid, but the land's life cannot grow anymore and any player can replace it for another color.

Furthermore, the deposited token on that land is distributed to all the neighboring land that have a different faction.

When life reaches 7 life, the land reaches its ultimate state and the owner of the land can withdraw it to get back the deposit.



# The Contract Interface


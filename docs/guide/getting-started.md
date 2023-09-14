# Introduction

Stratagems is at its core a social game of coordination. It takes place on an infinite grid where cells of different colors decide the fate of the game world. Each day players stake a small amount of ETH for each cell they want to own. The next day they discover whether their stratagy was wise. The social elements quickly comes into play as who knows the other's moves get an advantages over those we do not.

But the game does not stop there. Stratagems is a world being created by each player's action and new mechanics can be added on top, giving infinite possibilities to its inhabitants.

# How to play ?

Right now, we are play-testing the game at https://test.stratagems.world 

The interface is in constant evolution so the current guide might be out of date at short notice, but as it stand, the game work as follow:

The game has 2 phases: Commit and Reveal.

The commit phase last 23h and the reveal phase, 1 hour only.

> Currently for the test, the time will be accelerated to accomodate a more synchronous and fast gameplay among the participants.

Player needs to own some Test Tokens (Join our [discord](https://discord.gg/Qb4gr2ekfr) for this)

Once they get some, they can place color on the board by depositing 1 token on each cell they want to place. They pick the color by clicking on the cell.

Once you are happy with your moves, you can commit and wait for the reveal phase, which will then notify you to reveal your previous move.

if you missed on the resolution, your token get burnt.

# The Rules

Stratagems takes place on an infinite grid. Actually it is bounded to some high mumber but in practise this does not matter.

The grid is composed of square cell, each having 4 neighbors. Diagonal does not count.

Each square cell can contains a color.

At the start, all the cell are empty but as players play, it get filled  with colors.

There are only 6 colors, 5 owned by players and 1 owned by no-one, the black color.
 
For a player to place a color on the grid, they must deposit X token on the cell.

That cell must be empty or dead.

Player are not tied to a specific color and can play any color as long as they have emough token.

When a player place a color on the grid, they get ownership of it, except for the 6th color who can never be owned by anyone.

If 2 or more players happen to place a color on the same cell, the players still deposit their token but the cell becomes of the 6th color and is owned by no-one. The deposit remains available for capture though and player are still free to put more color on the grid to capture the deposit back.

Colored cells starts with 1 life and grows depending on their neighbours.

when a cell has no neighbor, the cell do not grow

When a cell has only neihbor of the same color, it grows by that number every day.

When a cell has only neighbor of different color its life decrease by that number

When there are both same-color and diferent color neighbord, its life decrease by the difference betweent the 2 numbers

If the number of same-color neighbor is equal to the number of different-color neighbor, its life decrease by one

When life reaches zero, the cell dies. When that happens, the color remains active on the grid, but the cell cannot grow anymore and any player can replace it for another color.

Furthermore, the deposited token on that cell is distributed to all the neighboring cells that have a different color.

When life reaches 7 life, the cell reaches its ultimate state and the owner of the cell can withdraw it to get back the deposit.



# The Contract Interface


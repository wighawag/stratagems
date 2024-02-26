<style>
/* no title on notes */
.custom-block-title {
    display: none;
}
</style>

![](/public/title.png)

# A World Map Created By Players

![World Map](/public/images/map-example-01.png)

In Stratagems, players are actual gods. They are the one creating the world island after island. They do so by depositing some ETH while deciding which factions will be in charge of the island thus created. 

Neighbouriung factions of different color then auto-fight and upon losing the ETH deposited is given to the player controling the Land of the winning factions. This is how player compete.

Stratagems is thus at its core a social game of coordination. It takes place on an (for practical purpose) infinite world where the factions inhabiting that land decide the fate of the game world. Each day players stake a small amount of ETH for each land they want to own. The next day they discover whether their stratagy was wise. The social elements quickly comes into play as who knows the other's moves get an advantages over those we do not.

But the game does not stop there. Stratagems is a world being created by each player's action and new mechanics can be added on top, giving infinite possibilities to its inhabitants.

# How to play ?

Stratagems is a [simultaneous turn based game](https://en.wikipedia.org/wiki/Timekeeping_in_games#Simultaneously_executed_and_clock-based_turns) and each "turn" (we call them epoch) last 24 hours.

Each 24h long epoch is divided in 2 phases: the commit phase (which last 23h) and the reveal phase (which last 1 hour).


![Commit/Reveal](/public//images/commit-reveal.png)


During the commit phase, players make their moves and commit to it by making a single transaction. They can change the decision at any time during the 23h and can collaborate with other player to decide on the best tactics. Once the commit phase is over, they can't change their decision and have to reveal their move in the 1 hour long reveal phase, or they lose the stake deposited.

During the reveal phase, all action are resolved simultaneously (well each reveal is a single transaction, but their order do not matter). While player can perform the reveal themselves, we offer by default a service that will reveal the moves automatically and we use [specific technologies](https://fuzd.dev) to ensure that even ourselves can't know the player's action until it is time to reveal. Once the reveal is over the next commit phase start.

At this point, player discover what the other players have done and get happily suprised or grudily accept their demise. As we will see laterm Stratagems has also some unique properties which encourage plyaer to communicate.


## The Rules

In Stratagems player deposit ETH (Token in our free-to-play mode) to create land. Land start with 2 life, represented by 2 houses next to the center casttle.

<img style="float: right; max-width: 40%;margin-left:1rem;" src="/public/images/rules/single.png" >

The rules that dictate how land grow or die is then pretty straigthforward. The basic thing to look at is the number of neiighbouring factions of different colors.


If you place an island on its own (like on the right), that is without any neighbouging land, only sea tiles, the land will grow. Land only grow by one. THis is represented by the tent, which will become a house on the next epoch.

<div style="clear: right;"> </div>


<img style="float: right; max-width: 40%;margin-left:1rem;" src="/public/images/rules/two.png" >

If on the other hand, there is 2 neighboring lands inhabited by different faction like shown on the right, they will auto-fight and because they do not have any other neighbors helping them, they will both lose 1 life each epoch until they dies (0 house left).

When this happen, the ETH deposited (represented as gems atop the castle) will be given to the player controling the attacking lands. In that case since there is only 2 player with equal strength they will both get their deposit back by swaping.

<div style="clear: right;"> </div>



<img style="float: right; max-width: 40%;margin-left:1rem;" src="/public/images/rules/attack-strategy-01.png" >

But if a player have supporting neighbors like shown on the left, only the player owning the weaker land will get its deposit slashed. In the case shown, after 2 turns the red player will take the ETH deposited on the blue land.


<!-- Note that when a land is under attack and losing against its neighbors, it can only lose 1 land per epoch. Same applies for gaining life. As seen on the sourrounded screen, red land on the corner have 2 red neiohbor yet they only grow by one.

<img style="float: right; max-width: 40%;margin-left:1rem;" src="/public/images/rules/surrounded.png" > -->

Furthermore, it is worth noting that diagonal do not count and that like in the one vs one case above, if there is the same number of enemy neighbor faction and friendly neighbor faction, then the result is still a -1 life.

<div style="clear: right;"> </div>

<img style="float: right; max-width: 40%;margin-left:1rem;" src="/public/images/rules/neighborhoud-02.png" >


In other words, as soon an enemy is a neighbor, you need more friendly faction than enemy. This also means that if you manage to put at least 2 different faction next to a target, it will lose.

<div style="clear: right;"> </div>

### The Evil color

<img style="float: right; max-width: 40%;margin-left:1rem;" src="/public/images/rules/evil-01.png" >

In the picture on the right, you can a castle with the black color. In Stratagems there is in total 6 factions but only 5 that are player-owned. The black color is owned by no one and come into existence when 2 or more player deposit ETH at the same place on the same epoch.

The ETH thus deposited is not lost yet and player can attempt to capture by attacking the land like any other.

::: info Info

Note that this is why in Stratagems it is important to communicate with other player because even if 2 player plays the same faction, if they end up placing it at the same location, their moves get transformed into a black castle.

:::

<div style="clear: right;"> </div>

## More details

Each square cell can contains a faction / color.

when a land has no enemy neighbor, the land's life grow by one

When a land has only enemy neighbor, its life decrease by one.

When a land has both, if the number of friendly neighbor is bigger than the number of enemy, life grow by one, else it decrease by one.

When life reaches zero, the land dies and loses its deposit (represented by a gem). When that happens, the land and the faction remains active on the grid, but the land's life cannot grow anymore and any player can replace it for another color.

Furthermore, the deposited token on that land is distributed to all the neighboring land that have a different faction.

When life reaches 7 life, the land reaches its ultimate state and the owner of the land can withdraw it to get back the deposit.


# The Interface 

![Commit/Reveal](/public/images/interface-01.png)


Player needs to own some Test Tokens (Join our [discord](https://discord.gg/Qb4gr2ekfr) for this)

Once they get some, they can place island and their associated faction on the board by depositing 1 token on each land they want to place. They pick the faction by clicking on the land thus created. You can remove that land by clicking to rotate the selected faction until the land get reset.

Once you are happy with your moves, you can commit and wait for the reveal phase, which will then notify you to reveal your previous move.

if you missed on the resolution, your token get burnt.

Note that we are now integrating our third party service [FUZD](https://fuzd.dev) which will let you make the commit and let the reveal be done automatically. This has some security assumption that you might want to be aware of (see [FUZD](https://fuzd.dev)) but this should offer a far more compelling experience for players.



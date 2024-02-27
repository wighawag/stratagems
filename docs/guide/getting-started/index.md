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

Neighbouriung factions of different color then auto-fight and upon losing, the ETH deposited is given to the player controling the Land of the winning factions. This is how player compete and how the world get created.

Stratagems is thus at its core a social game of coordination. It takes place on an gigantic sea where factions inhabiting its islands decide the fate of the game world. 

Each day players stake a small amount of ETH (or Test Tokens in our free-to-play version) for each land they want to own. The next day they discover whether their stratagy was wise or doomed. The social elements quickly comes into play as who knows the other's moves get an advantages over those we do not.

But the game does not stop there. Stratagems is a world being created by each player's action and new mechanics can be added on top, giving infinite possibilities to its inhabitants.

# How to play ?

Stratagems is a [simultaneous turn based game](https://en.wikipedia.org/wiki/Timekeeping_in_games#Simultaneously_executed_and_clock-based_turns) and each "turn" (we call them epoch) last 24 hours.

Each 24h long epoch is divided in 2 phases: the commit phase (which last 23 hours) and the reveal phase (which last 1 hour).


![Commit/Reveal](/public//images/commit-reveal.png)


During the commit phase, players make their moves and commit to it by making a single transaction along with the corresponding deposit. They can change the decision at any time during the 23h and can collaborate with other players to decide on the best tactics. Once the commit phase is over, they can't change their decision and have to reveal their move in the hour, or they lose the stake deposited.

During the reveal phase, all actions are resolved simultaneously (each reveal is its own transaction, but their order do not matter). 

While player can perform the reveal themselves, we offer by default a service that will reveal the moves automatically and we use [specific technologies](https://fuzd.dev) to ensure that even ourselves can't know the player's action until it is time to reveal. Once the reveal is over, the next epoch start with a new commit phase.

At this point, player discover what the other players have done and get happily suprised or grudily accept their demise. This is also where each Land evolve according to specific rules of Stratagems.


## The Rules

In Stratagems player deposit ETH (or Token in our free-to-play mode) to create lands anywhere they wish to. Land start with 2 lifes, represented by 2 houses next to the center casttle. The castle also shows a floating gems representing the deposited ETH/Token.



The rules that dictate how land grow or die is then pretty straigthforward. The basic thing to look at is the number of neighbouring land and the various colored factions positioned there.

<img style="float: right; max-width: 40%;margin-left:1rem;margin-bottom:1rem;" src="/public/images/rules/single.png" >

There are 5 player owned factions, Blue, Red, Green, Yellow, Purple, and one Black, controlled by no one, which we will discuss further below. Factions of different colors attack each other and determine whether a Land grow or decrease its number of life.


If you place an island on its own (like shown on the right), that is without any neighbouging land, only sea tiles around, the land will start with 2 lifes (represented by the houses) and then grow by one. This is represented by the tent, which will become a house on the next epoch.

<div style="clear: right;"> </div>


<img style="float: right; max-width: 40%;margin-left:1rem;margin-bottom:1rem;" src="/public/images/rules/two.png" >

If on the other hand, there is 2 neighboring lands inhabited by different faction like shown on the right, they will auto-fight and because they do not have any other neighbors helping them, they will both lose 1 life each epoch until they dies (0 house left). This is represented by the house in fire. The battle is also represented by 2 units fighting each other on the border between the 2 lands.



<img style="float: right; max-width: 40%;margin-left:1rem;margin-bottom:1rem;" src="/public/images/rules/two-next-next.png" >

When lands reach 0 life, the ETH deposited (represented by the gem atop the castle) will be given to the player controling the attacking neighboring lands. In the case shown on the rigjt, since there is only 2 players with equal strength they will both get the deposit of each other and lose nothing overall. 

Note though that land that reaches 0 life its faction remains active and affect neighboring lands as before. Player can place land atop to change their faction if they wish.



<div style="clear: right;"> </div>



<img style="float: right; max-width: 40%;margin-left:1rem;margin-bottom:1rem;" src="/public/images/rules/attack-strategy-01.png" >

But if a player have supporting neighbors like shown on the right, only the player owning the weaker land will get its deposit slashed. In the case shown, after 2 turns the red player will take the ETH deposited on the blue land.


<!-- Note that when a land is under attack and losing against its neighbors, it can only lose 1 land per epoch. Same applies for gaining life. As seen on the sourrounded screen, red land on the corner have 2 red neiohbor yet they only grow by one.

<img style="float: right; max-width: 40%;margin-left:1rem;margin-bottom:1rem;" src="/public/images/rules/surrounded.png" > -->

Furthermore, it is worth noting that diagonal do not count and that like in the one vs one case above, if there is the same number of enemy neighbor faction and friendly neighbor faction, then the result is still a -1 life.

<div style="clear: right;"> </div>

<img style="float: right; max-width: 40%;margin-left:1rem;margin-bottom:1rem;" src="/public/images/rules/neighborhoud-02.png" >



In other words, as soon an enemy is a neighbor, you need more friendly faction than enemy. This also means that if you manage to put at least 2 different faction next to a target, it will lose.

<div style="clear: right;"> </div>

### The Black Faction

<img style="float: right; max-width: 40%;margin-left:1rem;margin-bottom:1rem;" src="/public/images/rules/evil-01.png" >

In the picture on the right, you can see a castle with the black color with what looks like 2 gems stacked up. In Stratagems there is in total 6 factions but only 5 that are player-owned. The black color is owned by no one and come into existence when 2 or more player deposit ETH at the same place at the same epoch.

The ETH thus deposited is not lost yet and player can attempt to capture by attacking the land like any other.

::: info Info

Note that this is why in Stratagems it is important to communicate with other player because even if 2 player plays the same faction, if they end up placing it at the same location, their moves get transformed into a black castle too.

:::

<div style="clear: right;"> </div>

## Summary of the rules

Each square can contains a faction / color.

when a land has no enemy neighbor, the land's life grow by one

When a land has only enemy neighbor, its life decrease by one.

When a land has both, if the number of friendly neighbor is bigger than the number of enemy, life grow by one, else it decrease by one.

When life reaches zero, the land dies and loses its deposit (represented by a gem). When that happens, the land and the faction remains active on the grid, but the land's life cannot grow anymore and any player can replace it for another color.

Furthermore, the deposited token on that land is distributed to all the neighboring land that have a different faction.

When life reaches 7 life, the land reaches its ultimate state and the owner of the land can withdraw it to get back the deposit.


# The Interface 

![Commit/Reveal](/public/images/interface-01.png)

Most of the interface space is taken by the map where player can create island. They do so by tapping on it. 

On the top left corner, their current selected faction is shown.

::: info
In Stratagems players are not stuck into one faction they can decide to use different faction at different time and place. Bote though that if you place 2 oposing factions next to each other, you will make them attack each other even if you are the owner of both. This will prevent growth and might result in part of your deposit to go to other players next to you.
:::

When they first tap on the map, the Commit panel will show up on the bottom right. It will show you how many ETH/Token you need to perform your move. If you confirm, you ll be sending that amount in the game and will need to reveal your move in the reveal phase.

By default we do this for you as long as you add some ETH to your deposit to pay for the cost of the reveal transaction. But note that we make no guarantee that we will succeed in performing your tx. We aims to do our best though. Just be warned as if we fails to reveal in time, your deposit is lost forever.

The commit panel will also warn you if you do not have enough ETH/Tokens. In the free-to-play version, we provide players some Tokens to play with. Join our [discord](https://discord.gg/Qb4gr2ekfr) if you did not get any yet.


Once you are happy with your moves, you can commit and wait for the reveal phase, which will then notify you to reveal your previous move.


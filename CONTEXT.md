# Commit-reveal games

The vocabulary of a template for simultaneous-turn games: everyone acts at the
same time, hidden, and the results are applied together. A game built from this
template inherits these words and adds its own; nothing here describes a
particular game, and nothing here is implementation.

Where a word belongs to the FRAMEWORK it is used nowhere else. Where a word is
reserved for GAMES the framework never uses it, so that a game can mean by it
whatever its players would mean.

## Language

### The clock

**Cycle**:
One numbered interval of play: a commit phase, then a reveal phase, and nothing
else. Every player may act at most once in it.
_Avoid_: epoch, round, turn, tick, period, era

**Commit phase**:
The half of a cycle in which a player may hide what they intend to do. There is
no other way into a cycle.
_Avoid_: planning phase, submission window

**Reveal phase**:
The half of a cycle in which a hidden intention is opened and applied. It always
follows the commit phase of the same cycle, which is why an intention committed
in the current cycle can always still be opened.
_Avoid_: resolution phase, settlement window

**Cycle policy**:
How cycles advance: on the clock, only when someone pushes them, or on the clock
with unanimity able to bring the next phase forward.
_Avoid_: epoch mode, turn mode

**Advance**:
Moving the cycle on by a transaction rather than by the clock. It may only ever
do what the rules already permit, so anyone may do it and it is nobody's move.
_Avoid_: skip, force, tick

**Waited-for member**:
Someone the cycle blocks on: unanimity is measured against this count and not
against who is alive. A game decides separately what it costs to stop being one.
_Avoid_: roster, active player, participant

### The player

**Submission**:
One player's pass through one cycle: planning actions, hiding them, committing,
and then opening them or losing what was at stake.
_Avoid_: round, turn, commitment, action set

**Actions**:
What a player submits into a cycle. ORDERED, because two orderings of the same
actions are two different commitments, and each game defines what one is.
_Avoid_: moves, orders, action set

**Chunk**:
As many actions as one TRANSACTION may carry. A submission longer than a chunk
is opened in several reveals, in order. It bounds the transaction and never the
submission: how many actions a submission may contain at all is a game's own
rule, which the framework does not have and does not take a word for.
_Avoid_: batch, page, part, step

**Commitment**:
The hidden form of a submission: the head of a hash chain, each link holding one
chunk and the hash of the next. What the chain holds between committing and
revealing, and until every chunk has arrived.
_Avoid_: hash, sealed move, bid

**Stake**:
Whatever a player loses by never revealing. Every game must have one, and no two
games need agree on what it is.
_Avoid_: bond, deposit, collateral

**Forfeit**:
Ceasing to be a waited-for member, and nothing else. It settles nothing, returns
nothing and burns nothing: a forfeit that paid out would be a costless way to
not reveal.
_Avoid_: quit, withdraw, resign, settle

### Before the first cycle

**Lobby**:
Where it is settled who will be in a game, BEFORE it exists. It is not a
waiting room: what makes somebody a waited-for member is being given whatever
this game puts at stake, and that happens once, while the game is being set up.
So a lobby is the last moment membership can be decided at all, and changing it
afterwards means a different game rather than a different setting.
_Avoid_: menu, room, matchmaking, setup

**Seat**:
One place in a lobby, which becomes one waited-for member. A seat is not a
player count: it has an OCCUPANT, and the question a lobby answers is who is in
each one rather than how many there are.
_Avoid_: slot, player slot, spot

**Occupant**:
Who is in a seat. It is the axis along which lobbies differ - a person at this
browser, a person at the same keyboard, something the machine plays - and
nothing else about a seat changes when it changes.
_Avoid_: participant, agent, bot, NPC

**Played seat**:
A seat the machine ACTS FOR, because its occupant is the machine. It is not a
kind of player and the word deliberately describes the seat rather than
inventing one: what makes it necessary is the clock, not the game. A cycle waits
for every member, so a member that never acts does not make a quiet game, it
makes a frozen one - which means whoever sets a game up either plays these seats
or does not enrol them. The smallest thing that gives a cycle somebody to wait
for: no intelligence, no difficulty, no interface.
_Avoid_: bot, NPC, AI, opponent, computer player, played player

### Who is who

**Identity**:
Who plays, as the game counts players. It may be an account, or a token the
account owns, and everything a player holds is keyed by it.
_Avoid_: player address, user, avatar

**Account**:
The address that OWNS: the stake, the identity, and anything won. It authorises
others to act for it and can always take that back.
_Avoid_: wallet, owner, user

**Signer**:
A key held in one browser that acts FOR an account, so that a cycle costs no
prompts. It owns nothing and can never withdraw anything.
_Avoid_: burner, delegate key, session key

### Reserved for games, never used by the framework

**Round**:
Whatever a game builds out of several cycles, if it builds anything: the rounds
of a duel, a match, a day. The framework has no such concept and takes no
position on it.

**Turn**:
Whatever a game calls one player's contribution, if it wants the word. Games
here are simultaneous, so a turn is not an interval; and in a game whose actions
are directions, turning is also a move. This template's own reference game takes
the word: what the framework calls a submission, its HUD calls a turn.

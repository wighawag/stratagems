# `$lib/game/offline`: an offline world's steps

An offline world of a commit-reveal game is three layers, and this is the middle one.

| Layer                        | Where                                                    | What it knows                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| the mechanism                | `$lib/embedded` (jolly-roger `with/embedded-chain`)      | a chain in the tab, a deploy on it, a connection to it                                                                                              |
| an app's world               | `$lib/offline-world` (jolly-roger `with/embedded-chain`) | the opener (the remembered chain id, the probe, a new id on an incoherent restore), the boot's memo and status, the world connecting its own wallet |
| a commit-reveal game's world | here                                                     | the world's wallet and gas, the table walk, the world's table, the people at this device, the played seats, what starts with the board              |
| the game's composition       | its `$lib/offline.ts`                                    | its deployment, its stake, who an address plays as, how its seats decide, its own steps                                                             |

## The steps

- `createOfflineWallet()`: the wallet the world announces at provisioning (one account per person here) and the gas every seat plays with. `current()` is what the world switches accounts on; `stop()` unannounces it.
- `stakeEverySeat({table, you, humans, stake})`: the walk of the table, calling the game's `stake` with each seat's address, index and occupant. The index is there for a game whose identity depends on the seat.
- `openTheWorldsTable({world, wallet, lobby, table, at, stake, chainIdKey, storageKey})`: the table set, staked and started (`$lib/game/lobby/offline-table`), and the records and connection composed on it; a record the chain does not hold lets go of the world and answers `incoherent`, so the game builds again. `theWorldsGame(world)` is the same answer for a world that is not a table.
- `revealerForTheHumans`, `seatTheHumans`, `handOverBetweenThem`: the hotseat's local revealer (before the context), the people here connected, signed in and authorised (after it), and the handover between them.
- `resolvePlayedSeats({table, identityOf})`: the world's seats as its loop takes them, the game spelling each identity, told the seat's index too.
- `readyToPlay({context, players, revealer, hotseat, decider, also})`: what a `Ready` world carries as its `context`, starting everything with the board and stopping it in reverse.

## Why steps and not one function with hooks

Measured across the games when this was extracted (jolly-roger's plan, K2): a game's `buildOfflineWorld` varies the identity a seat plays as, what a seat is staked with in the world and at a table, what it reads off its opened table, how its seats decide, a step before the boot, a step after the authorisation, extra starts, and in one game the opener itself. One `createOfflineGame(spec)` would need all eight as hooks and would widen with every new game. A game that composes steps calls one more function of its own instead.

## The wires

Every key a world persists under stays the game's (`CHAIN_ID_STORAGE_KEY`, `TABLE_STORAGE_KEY` in its `offline.ts`) and is passed in: a world a browser already holds must restore across any change here.

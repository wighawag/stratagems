<p align="center">
  <a href="https://stratagems.eth.limo">
    <img src="web/static/logo_and_title.png" alt="Stratagems Logo" width="500">
  </a>
</p>
<p align="center">
  <a href="https://twitter.com/stratagems_eth">
    <img alt="Twitter" src="https://img.shields.io/badge/Twitter-1DA1F2?logo=twitter&logoColor=white" />
  </a>
  <a href="https://github.com/wighawag/stratagems">
    <img alt="GitHub commit activity" src="https://img.shields.io/github/commit-activity/m/wighawag/stratagems">
  </a>
  <!-- <a href="https://github.com/wighawag/stratagems">
  <img alt="Build" src="https://github.com/wighawag/stratagems/actions/workflows/build.yml/badge.svg">
  </a> -->
  <a href="https://github.com/wighawag/stratagems/blob/main/LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/wighawag/stratagems.svg">
  </a>
  <a href="https://github.com/wighawag/stratagems/issues">
    <img alt="open issues" src="https://isitmaintained.com/badge/open/wighawag/stratagems.svg">
  </a>
</p>

---

# An infinite game

Stratagems is an infinite game, a permission-less, immutable and interroperable game. Un unstoppable game where all meaningul actions happen on-chain.

If you are interested to know more about infinite games and autonomous worlds, check out our [blog post](https://ronan.eth.limo/blog/infinite-games/)

## What is stratagems exactly ?

Stratagems is an infinite board game, a persistent and permission-less game where players use a specific set of colors to compete for the control of the board. Alliances and betrayal are part of the arsenal as colors mix and shift on the board.

And so “stratagems” is first and foremost a social game. Its main inspiration is [conquest.eth](https://conquest.game) who successfully created a deeply social game out of simple mechanics. Stratagems explore it further by having even simpler rules. It also reduces the gas cost to minimum by spreading the actions over a week period. It works because most of the game plays out in the conversations and strategies happening among the players.

While maximally on-chain, stratagems scale its gameplay by offering a compelling off-chain gameplay with the social complexity associated with it.

## How do you play ?

Players participate in the game by depositing ETH (ratio to be defined) to place a gem on the board. They specify the location and the color of the gem.

By doing so, they risk the associated ETH but also get a chance to potentially capture the same (and more) from other players.

More detailts coming soon! Follow our [twitter](https://twitter.com/stratagems_eth)

## How to run it locally?

We are assuming here that you already setup your env as specified in the [initial setup section](#initial-setup)

Then Assuming you have [zellij](https://zellij.dev/) installed

```bash
pnpm start
```

**And you are ready to go!**

Note that if you do not have [zellij](https://zellij.dev/) (on windows for example) you can use [wezterm](https://wezfurlong.org/wezterm/index.html)

```bash
pnpm start:wezterm
```

Or you can also launch each component in their own process

```bash
pnpm local_node
```

```bash
pnpm contracts:compile:watch
```

```bash
pnpm contracts:deploy:watch
```

```bash
pnpm indexer:dev
```

```bash
pnpm web:dev
```

## Deploying to a network

Just execute the following

```bash
pnpm contracts:deploy:prepare <network>
```

and it will ask you few questions and get your .env.local setup with the var needed to deploy on the network of your choice.

You just need to have a endpoint url and mnemonic ready for it.

You can of course configure it manually with more option if you need

Then you can deploy your contract

```bash
pnpm contracts:deploy <network>
```

## Initial Setup

You need to have these installed

- [nodejs](https://nodejs.org/en)

- [pnpm](https://pnpm.io/)

  ```bash
  npm i -g pnpm
  ```

Then you need to install the local dependencies with the following command:

```bash
pnpm i
```

We also recommend to install [zellij](https://zellij.dev/) to have your dev env setup in one go via `pnpm start`

# Tutorial

The best way for now to create a game on top of Stratagems evolving world map is to fork the project

## 💻 Clone / Fork and Install

> We are assuming here that you have [nodejs](https://nodejs.org/en) and [pnpm](https://pnpm.io/) installed
>
> We also expect you to have [git LFS (Large File Storage)](https://git-lfs.com/) installed
>
> We also recommend to install [zellij](https://zellij.dev/)

1. Clone the repository

   > Before cloning you will need to have [git LFS (Large File Storage)](https://git-lfs.com/) installed

   ```bash
   git clone https://github.com/wighawag/stratagems.git
   cd stratagems
   git remote rm origin # this remove the origin
   git remote add origin <your-repo>
   ```

   > Note that you can also fork the project directly from github and clone the resulting repo

   Then, ensure the LFS hooks are present:

   ```sh
   git lfs install
   ```

   > If you installed git lfs after already cloning the repo, you will also need to execute the following:

   ```sh
   git lfs pull
   ```

2. Install dependencies

   ```bash
   pnpm i
   ```

3. Then Assuming you have [zellij](https://zellij.dev/) installed

   ```bash
   pnpm start
   ```

   **And you are ready to go!**

> **Note** If you do not have [zellij](https://zellij.dev/) (on windows for example) you can use [wezterm](https://wezfurlong.org/wezterm/index.html)
>
> ```bash
> pnpm start:wezterm
> ```
>
> Or you can also launch each component in their own process
>
> ```bash
> pnpm local_node
> ```
>
> ```bash
> pnpm contracts:compile:watch
> ```
>
> ```bash
> pnpm contracts:deploy:watch
> ```
>
> ```bash
> pnpm indexer:dev
> ```
>
> ```bash
> pnpm web:dev
> ```

## 👾 Play

Just navigate to the url mentioned in the console. If you have no other thing running, it should be [http://localhost:5173/]()

You ll see an empty sea. There you cna get yoruself some token with the ("get tokens") button and start putting land.

Feel free to switch account on your wallet to play as multiplery

The rules are described [in our doc](/guide/getting-started/)

### Running against existing live instance

If you want to play with a live game, you can also execute the following and see a live map

- For the current alpha on the Base network:

  ```bash
  pnpm attach alpha1
  ```

- For the testnet version on base sepolia:

  ```bash
  pnpm attach alpha1test
  ```

## Extend!

Now that you can play the game locally, you can start tinkering with adding new smart contract and mechanics.

### What to play with ?

Stratagems is unique in that it does not have hooks to hook into. It rather expose a set of new primitive you can play with. You can think of it as blockchain itself, a protocol which you can read data and affects the value of everybody actions even on the base game

Still wondering ?

Well, in the current map you can see

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

And you can verify the contract

- on etherscan:

```bash
pnpm contracts:verify <network> etherscan
```

- using sourcify:

```bash
pnpm contracts:verify <network> sourcify
```

for etherscan if the network is not supported by default (no endpoint), you can provide your own:

```bash
pnpm contracts:verify <network> etherscan --endpoint <api endpoint url>
```

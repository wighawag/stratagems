# The acquisition rail

Every game on this template gates entry on something, because a player who dislikes what they committed to can simply go quiet: unless holding a position costs something, nobody has to reveal. What that something is varies (a bonded token reserve, custody of an item the player bought, a pass) and the rail does not care. What every one of them shares is the shape of GETTING it, and that shape is what lives here.

**One transaction, a gas stipend, recoverable after a reload.** In order:

1. the owner SIGNS a delegation. Free, no transaction, and for an account whose credential was minted at sign-in not even a prompt.
2. the owner sends ONE transaction, which acquires the thing and forwards a stipend to this browser's local signer in the same call.
3. the SIGNER registers itself, out of the stipend it just received.

The alternative is two transactions from the owner and, on a fresh wallet, two faucet claims, because the first transaction sends almost everything the faucet gave to the signer and the second then finds an empty wallet.

## What a game supplies

One value, `Acquisition`: where the call goes, what it costs, what it forwards, and how to build the arguments. That is the whole seam.

```ts
const acquisition: Acquisition = {
	// Whatever YOUR game sells entry with: one call that takes a value and
	// forwards a stipend. The rail never learns its name.
	address: deployments.contracts.Sale.address,
	functionName: 'purchase',
	price, // read off the deployment that CHARGES it
	stipend, // sized in turns of gas, not as a round number
	gas: 400_000n, // held back when asking whether a payer can afford it
	request: ({owner, stipendTo, stipend}) => ({
		abi,
		args,
		value: price + stipend,
	}),
};
```

`request` returns no address and no function name on purpose. The rail states that pair once and uses it both to send the call and to recognise it later in the operations ledger, so the two cannot drift. A request that named its own function would make the purchase work and the reload recovery silently stop finding it.

`stipendTo` is `undefined` when there is no signer to fund, and `stipend` is then `0n`. A request must not tell the contract to forward what it was not given: the value and the split would disagree and the call would revert.

## What the game keeps

The WORDS. What the thing is called, what the button says, what the player is told while it is in flight. Those are the game's brand, they are three short strings, and parameterising them would produce sentences that fit no game well. The rail exports the STATE; each game's HUD words it.

The one exception is `AcquireModal.svelte`, which is shared because payer choice and consent are neither brand nor game rule. It takes the store and one sentence of explanation as props, rather than reaching into the app context for a member whose name is the game's own business.

## When the dialog is the gate rather than the consent

`authorise.ts` is the same registration step with nothing in front of it, for a caller where choosing a payer is a question with exactly one possible answer: an offline world, whose payer and payee are the same generated wallet on a chain in the tab. It sends through the same two functions the button does (`registrationRequest`, then `submitRegistration`), so nothing about the contract path differs, and it returns an outcome rather than throwing, because the remedy already exists - the setup gate comes back with the button on it.

It does NOT skip the telling. A step taken for a player has to be one they were told about, or they meet it for the first time on a real chain with no idea what it is, so the caller owns that sentence. The offline world's is in `$lib/offline-lobby`.

## Why the recovery is not a flag

`findPendingAcquisition` reads the operations ledger. A store dies with the tab: reload while the transaction is in flight and the setup gate goes back to offering the thing to someone whose money is already spent, and depending on the game the second attempt buys another one and charges again. Writing a "buying" flag into local storage would be a second copy of a record the app already keeps durably, with its own staleness, its own cleanup and its own way of disagreeing with the chain.

It only works for a purchase paid from a SECOND wallet because the payment rail's client is wrapped by the transaction tracker. A rail whose client is not tracked sends purchases that never reach the ledger at all.

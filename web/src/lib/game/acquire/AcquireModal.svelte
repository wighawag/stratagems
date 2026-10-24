<!--
	Who pays for the thing that lets you play, and what they are agreeing to.

	The same question the top-up flow asks, in the same words, from the same
	payment-methods list. A separate modal rather than a reuse of `TopUpModal`
	because the two flows answer different questions (this buys a thing, that
	tops up gas) and share the part that matters: the RULE for which methods are
	available, which lives in `$lib/core/funding` and is tested there. Two copies
	of the markup is a smaller problem than two rules about whether an account can
	pay, which a player would experience as the app contradicting itself.

	Only shown when there is a genuine choice; `acquisition.buy()` skips straight
	to the single available method when there is one, and to `NoPaymentMethod`
	when there is none.

	TAKES ITS STORE AS A PROP rather than reaching into the app context, which is
	what lets it be shared: the context member a game hangs its acquisition off is
	the game's own business, and a component that guessed at the name would be
	shared in name only. The one sentence that describes WHAT is being bought is a
	prop too, for the same reason.
-->
<script lang="ts">
	import * as Modal from '$lib/core/ui/modal/index.js';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {formatAmount} from '$lib/core/funding';
	import {opensAWallet, type AcquisitionStore} from './acquire';

	let {
		acquisition,
		explanation,
		decimals,
		symbol,
	}: {
		acquisition: AcquisitionStore;
		/**
		 * One sentence saying what this transaction buys, in the game's own terms.
		 *
		 * It should say where the thing GOES as well as what it is: "buy" suggests
		 * something arriving in the player's wallet, and for a game that holds the
		 * stake in custody it does not. Somebody expecting to see it appear should
		 * be told beforehand rather than go looking.
		 */
		explanation: string;
		/** The chain's native currency, for the figure in the consent dialog. */
		decimals: number;
		symbol: string;
	} = $props();
</script>

<!--
	THE MODAL LAYER, NOT THE SYSTEM ONE.

	The system layer is for a live question about something already IN FLIGHT,
	which "must be able to cover whatever raised it" (core/ui/layers.ts). This is
	the opposite on both counts: nothing has been dispatched yet, and choosing
	"another wallet" RAISES the connection flow, which is a system modal and has
	to cover this one.

	It is also the wrong way round in practice. This is declared in a PAGE, and
	layers.ts warns that a page remounts on every navigation and takes a fresh
	slot at the END of its layer while AcrossPages keeps the one it took at
	startup. In the system layer that would put the payer chooser over the wallet
	picker it had just opened.
-->
<Modal.Root
	layer="modal"
	openWhen={$acquisition.step === 'ChoosingPayer'}
	onCancel={() => acquisition.dismiss()}
>
	<Modal.Title>How would you like to pay?</Modal.Title>
	{#if $acquisition.step === 'ChoosingPayer'}
		<p class="text-sm text-muted-foreground">{explanation}</p>

		<div class="mt-3 flex flex-col gap-2" data-testid="acquire-payment-methods">
			<!-- Order is the order they are declared in payment-methods.ts, and the
			     first available one is the primary action: paying from the account is
			     one transaction and no second connection. Unavailable ones are shown
			     WITH their reason rather than hidden, so a player who expected to pay
			     one way is told why they cannot. -->
			{#each $acquisition.methods as method, i (method.id)}
				<Button
					variant={i === 0 ? 'default' : 'outline'}
					class="h-auto w-full flex-col items-start gap-1 py-3 text-left whitespace-normal"
					disabled={!method.available}
					onclick={() => acquisition.choose(method.id)}
					data-testid={`acquire-pay-with-${method.id}`}
				>
					<span class="font-semibold">{method.label}</span>
					<span class="text-xs font-normal opacity-80">
						{method.available ? method.description : method.unavailableReason}
					</span>
				</Button>
			{/each}
		</div>
	{/if}
</Modal.Root>

<!--
	Consent, before anything is signed or spent.

	The same list the top-up flow shows, from the same grant, because they are
	describing the same key. Its own dialog rather than a line in the chooser:
	this is the moment the player agrees to something, and it must be readable
	before the wallet opens rather than behind it.

	WHAT IT SAYS DEPENDS ON HOW THE AUTHORISATION IS OBTAINED, which the store
	puts in the state. Wording written for the wallet route and shown to all three
	promises an account whose credential was minted at sign-in a signature request
	that never comes, and offers it a button reading "Sign and buy" for a purchase
	with nothing to sign. The template's own top-up modal already words this per
	route (`$topUp.route`, `silentSigner`); this is the same distinction here.
-->
<Modal.Root
	layer="modal"
	openWhen={$acquisition.step === 'Consent'}
	onCancel={() => acquisition.dismiss()}
>
	<Modal.Title>
		{$acquisition.step === 'Consent' && opensAWallet($acquisition.authorisation)
			? 'One signature, then the purchase'
			: 'Confirm your purchase'}
	</Modal.Title>
	{#if $acquisition.step === 'Consent'}
		<!-- RESTATES WHO AND HOW MUCH. The player last saw a figure on a button
		     several dialogs ago and has since picked a wallet; being asked to sign
		     something with neither fact on screen is how a signature request starts
		     to look like it came from somewhere else. -->
		<dl class="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
			<dt class="text-muted-foreground">Paying from</dt>
			<dd class="font-mono break-all">{$acquisition.payer}</dd>
			<dt class="text-muted-foreground">Total</dt>
			<!-- `formatAmount` rounds DOWN and never prefixes a `~`: this is money
			     about to be spent, not a balance being reported, so an amount that
			     reads higher than what is sent would be worse than one that reads
			     lower. -->
			<dd>{formatAmount($acquisition.total, decimals)} {symbol}</dd>
		</dl>
		{#if $acquisition.authorisation === 'live-signature'}
			<p class="text-sm text-muted-foreground">
				First your wallet asks you to sign a message, which authorises this
				browser to play for you. It is not a transaction and costs nothing. The
				payment comes after it.
			</p>
		{:else if $acquisition.authorisation === 'silent-signature'}
			<!-- The development burner signs from a key in this browser and opens
			     nothing, so promising a prompt leaves the user waiting for a window
			     that never appears. Same sentence the top-up modal makes for it. -->
			<p class="text-sm text-muted-foreground">
				This also authorises this browser to play for you. Your development
				wallet signs that for you with no prompt, so the next thing that happens
				is the payment.
			</p>
		{:else}
			<p class="text-sm text-muted-foreground">
				Your account already authorised this browser when you signed in, so
				there is nothing to sign. The next thing that happens is the payment.
			</p>
		{/if}
		<ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
			{#each $acquisition.bullets as bullet (bullet)}
				<li>{bullet}</li>
			{/each}
		</ul>
		<div class="mt-4 flex gap-2">
			<!-- The button names what pressing it does. "Sign and buy" in front of a
			     purchase with nothing to sign describes a step that will not
			     happen. -->
			<Button size="sm" onclick={() => acquisition.confirmConsent()}>
				{opensAWallet($acquisition.authorisation) ? 'Sign and buy' : 'Buy'}
			</Button>
			<Button size="sm" variant="outline" onclick={() => acquisition.dismiss()}>
				Cancel
			</Button>
		</div>
	{/if}
</Modal.Root>

<!--
	Nothing here can pay, which is a real state rather than a fault: an account
	with no wallet, in a browser with no wallet installed. It gets the explanation
	the template already wrote for it.
-->
<Modal.Root
	layer="modal"
	openWhen={$acquisition.step === 'NoPaymentMethod'}
	onCancel={() => acquisition.dismiss()}
>
	<Modal.Title>No way to pay from this browser</Modal.Title>
	{#if $acquisition.step === 'NoPaymentMethod'}
		<p class="text-sm text-muted-foreground">{$acquisition.message}</p>
	{/if}
</Modal.Root>

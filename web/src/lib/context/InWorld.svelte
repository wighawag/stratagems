<script lang="ts">
	/**
	 * THE APP-WIDE OVERLAYS, FOR A NESTED WORLD.
	 *
	 * `AcrossPages` mounts these once, in the LAYOUT, bound to the app's own
	 * context. A page that provides a SECOND context (an offline world, a chain
	 * in the tab) puts the game below that provider and the layout above it, so
	 * every one of those overlays is still speaking for the other world: a flow
	 * started down here would drive a modal up there that reads a different
	 * context and shows a different chain, or - because the stores are
	 * per-context - would open nothing at all and the click would simply appear
	 * to hang.
	 *
	 * That is not hypothetical and it is what this file exists for. The setup
	 * gate's "Authorise and carry on" starts the top-up flow, which reaches its
	 * `choosing` step and waits for the player to pick a payer. With no modal in
	 * this subtree there is nothing on screen: the flow sits there, the board
	 * stays gated, and the only evidence is a console line.
	 *
	 * WHAT IS DELIBERATELY NOT HERE IS THE CONNECTION FLOW, and the reason is the
	 * opposite one. A flow exists to relay a WALLET's questions - which wallet,
	 * which account, approve this - and a wallet the world generated has none: it
	 * holds one account and signs without asking. Mounting one produces modals
	 * that flash past describing decisions nobody is making. The rule the two
	 * halves give between them: a nested world that uses the PLAYER's wallet
	 * needs its own connection flow, and one that brings its own must not have
	 * it, while both need the overlays below, because those belong to the app's
	 * own flows rather than to a wallet's questions.
	 *
	 * The debug surfaces are not here either: they are per SESSION rather than
	 * per context, and a second copy would report the same tab twice.
	 *
	 * ORDER IS STACKING ORDER within the system layer, exactly as in
	 * `AcrossPages`, so this list keeps that file's order rather than inventing
	 * one. See the long note there.
	 */
	import {PendingOperationModal} from '$lib/ui/pending-operation';
	import InsufficientFundsModal from '$lib/core/transaction/InsufficientFundsModal.svelte';
	import {TopUpModal} from '$lib/ui/credits/index.js';
	import ConfirmationModal from '$lib/core/ui/confirm/ConfirmationModal.svelte';
	import AccountCannotSendModal from '$lib/core/transaction/AccountCannotSendModal.svelte';
	import ErrorDetailsModal from '$lib/core/transaction/ErrorDetailsModal.svelte';
	import InFlightRequestsModal from '$lib/core/transaction/InFlightRequestsModal.svelte';
</script>

<PendingOperationModal />
<InsufficientFundsModal />
<TopUpModal />
<ConfirmationModal />
<AccountCannotSendModal />
<ErrorDetailsModal />
<InFlightRequestsModal />

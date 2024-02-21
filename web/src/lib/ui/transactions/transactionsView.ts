import type {PendingTransaction} from 'ethereum-tx-observer';
import {writable} from 'svelte/store';

export const transactionsView = writable({open: false});

export const transactionDetailsView = writable<{tx: PendingTransaction | undefined}>({tx: undefined});

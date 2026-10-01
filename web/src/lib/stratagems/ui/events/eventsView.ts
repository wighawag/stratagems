import type {PendingTransaction} from 'ethereum-tx-observer';
import {writable} from 'svelte/store';

export const eventsView = writable({open: false});

// export const eventDetailsView = writable<{event: CellPlacement | undefined}>({event: undefined});

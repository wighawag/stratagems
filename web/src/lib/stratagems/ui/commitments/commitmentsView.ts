import type {CommitMetadata} from '$lib/stratagems/account/account-data';
import type {OnChainActions} from '$lib/stratagems/account/base';
import {writable} from 'svelte/store';

export const commitmentsView = writable({open: false});

export const commitmentDetailsView = writable<{commitment: OnChainActions<CommitMetadata> | undefined}>({
	commitment: undefined,
});

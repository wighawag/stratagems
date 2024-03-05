import {setup} from 'missiv-client';
import {account, accountData} from '$lib/blockchain/connection';
import {derived, writable} from 'svelte/store';

export const openConversations = writable({
	open: false,
});

export const conversations = setup({
	endpoint: 'http://localhost:43002/api/conversations',
	namespace: 'stratagems',
	pollingInterval: 2000,
});

const accountAndAccountData = derived([account, accountData.info], ([$account, $localInfo]) => {
	return {
		$account,
		$localInfo,
	};
});

accountAndAccountData.subscribe(({$account, $localInfo}) => {
	conversations.setCurrentUser(
		$account.address && $localInfo.localKey
			? {
					address: $account.address,
					delegatePrivateKey: $localInfo.localKey,
				}
			: undefined,
	);
});

if (typeof window !== 'undefined') {
	(window as any).conversations = conversations;
	(window as any).openConversations = openConversations;
}

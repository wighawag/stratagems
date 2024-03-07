import {setup} from 'missiv-client';
import {account, accountData} from '$lib/blockchain/connection';
import {derived, writable} from 'svelte/store';
import {MISSIV_URI, initialContractsInfos} from '$lib/config';

export const openConversations = writable({
	open: false,
});

export const conversations = setup(
	MISSIV_URI
		? {
				endpoint: MISSIV_URI,
				domain: 'stratagems.world',
				namespace: initialContractsInfos.name,
			}
		: undefined,
);

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
					delegatePrivateKey: $localInfo.localKey.slice(2),
				}
			: undefined,
	);
});

if (typeof window !== 'undefined') {
	(window as any).conversations = conversations;
	(window as any).openConversations = openConversations;
}

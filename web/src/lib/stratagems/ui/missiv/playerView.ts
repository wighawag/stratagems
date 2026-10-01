import {writable} from 'svelte/store';

export const playerView = writable<{player: `0x${string}` | undefined}>({
	player: undefined,
});

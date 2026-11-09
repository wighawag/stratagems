import {describe, it, expect, vi} from 'vitest';
import {render} from 'vitest-browser-svelte';
import OfflineWorldFailed from '$lib/ui/offline-world/OfflineWorldFailed.svelte';
import OfflineWorldNavbar from '$lib/ui/offline-world/OfflineWorldNavbar.svelte';
import {offlineWorldExits} from '$lib/offline-exits';

/**
 * A FAILED OFFLINE BOOT OFFERS A WAY OUT, rendered in a real browser.
 *
 * The world and the lobby are app-scoped modules, so they are mocked here with
 * a world whose boot FAILED: a real failed boot needs a chain that refuses to
 * deploy every seat, which says nothing more about which buttons reach the
 * screen. Which exits are offered per step is asserted in
 * `test/lib/offline-exits.test.ts`; this holds that the components render it.
 */
const mocks = vi.hoisted(() => ({left: 0}));

// The navbar's Home link only needs a path; the real `$lib` composes the app.
vi.mock('$lib', () => ({route: (path: string) => path}));

vi.mock('$lib/offline', async () => {
	const {readable} = await import('svelte/store');
	return {
		offlineWorld: readable({step: 'Failed', error: 'could not deploy'}),
	};
});

vi.mock('$lib/offline-lobby', async () => {
	const {readable} = await import('svelte/store');
	return {
		offlineLobby: {
			...readable({step: 'Sat', seats: 4}),
			leaveTheTable: () => void mocks.left++,
		},
	};
});

const failed = offlineWorldExits({step: 'Failed'}, {step: 'Sat', seats: 4});

describe('a failed offline world', () => {
	it('shows "Try again" and "Leave this table" on its card, wired to their presses', async () => {
		let tried = 0;
		let left = 0;
		const screen = await render(OfflineWorldFailed, {
			error: 'could not deploy every seat',
			exits: failed,
			onTryAgain: () => void tried++,
			onLeave: () => void left++,
		});

		await expect
			.element(screen.getByText('The offline world did not start.'))
			.toBeInTheDocument();
		await expect
			.element(screen.getByText('could not deploy every seat'))
			.toBeInTheDocument();
		// Leaving is the destructive exit, and the card says so.
		await expect
			.element(screen.getByText(/throws this world away/))
			.toBeInTheDocument();

		await screen.getByTestId('try-the-world-again').click();
		expect(tried).toBe(1);
		expect(left).toBe(0);

		await screen.getByTestId('leave-the-failed-table').click();
		expect(left).toBe(1);
	});

	it('shows no exits on the card when none are offered', async () => {
		const screen = await render(OfflineWorldFailed, {
			error: 'x',
			exits: {leaveTheTable: false, tryAgain: false, seats: undefined},
			onTryAgain: () => {},
			onLeave: () => {},
		});
		await expect
			.element(screen.getByTestId('try-the-world-again'))
			.not.toBeInTheDocument();
		await expect
			.element(screen.getByTestId('leave-the-failed-table'))
			.not.toBeInTheDocument();
	});

	it('offers "Leave this table" in the navbar too, calling the lobby', async () => {
		const screen = await render(OfflineWorldNavbar);

		await expect
			.element(screen.getByText('4 seats at this table'))
			.toBeInTheDocument();
		const before = mocks.left;
		await screen.getByTestId('leave-the-table').click();
		expect(mocks.left).toBe(before + 1);
	});
});

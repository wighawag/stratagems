import type {OfflineWorldStatus} from '$lib/offline';
import type {LobbyState} from '$lib/game/lobby/lobby';

/**
 * THE WAYS OUT OF AN OFFLINE WORLD, per step of its boot.
 *
 * Home is always there (it is the navbar's left link and needs no decision).
 * What is decided here is the two exits that depend on the world:
 *
 * - **Leave this table** throws the world away and starts a new one
 *   (`offlineLobby.leaveTheTable()`). It is offered once the world is `Ready`
 *   AND once it has `Failed`: Home keeps the same table, so a world that fails
 *   every boot would otherwise have no exit short of clearing site data.
 * - **Try again** reloads into the SAME world: it restores from its persisted
 *   chain and runs the boot again, which is what a failed boot's own message
 *   tells the player to do. Only offered when the world `Failed`.
 *
 * NOTHING WHILE IT BOOTS (or before), because a boot in progress must not be
 * interrupted by a press that throws away the world it is building.
 *
 * `seats` is the table's size, and only when it is KNOWN: the lobby's count is
 * the world's table once the lobby has `Sat` (a sit-down or a restore), and a
 * default before that. A failed world may not have got that far.
 */
export type OfflineWorldExits = {
	leaveTheTable: boolean;
	tryAgain: boolean;
	seats: number | undefined;
};

export function offlineWorldExits(
	world: Pick<OfflineWorldStatus, 'step'>,
	lobby: Pick<LobbyState, 'step' | 'seats'>,
): OfflineWorldExits {
	const ready = world.step === 'Ready';
	const failed = world.step === 'Failed';
	return {
		leaveTheTable: ready || failed,
		tryAgain: failed,
		seats: (ready || failed) && lobby.step === 'Sat' ? lobby.seats : undefined,
	};
}

/**
 * Try again: reload into the same world. A new page is how a world is rebuilt
 * here (see `leaveTheTable`), and the world restores from its persisted chain.
 */
export function tryTheWorldAgain(): void {
	if (typeof location !== 'undefined') location.reload();
}

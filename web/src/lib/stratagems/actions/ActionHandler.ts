import {stratagemsView, type ViewCellData} from '$lib/state/ViewState';
import {account, accountData} from '$lib/blockchain/connection';

import {xyToXYID, Color, type ContractCell} from 'stratagems-common';
import {get} from 'svelte/store';
import {epochState} from '$lib/state/Epoch';
import {tour} from '$lib/ui/tour/drive';
import {info} from '$lib/ui/information/info';
import {modalStack} from '$utils/ui/modals/ModalContainer.svelte';
import {landmenu} from '$lib/ui/landmenu/landmenu';
import {zeroAddress} from 'viem';

export class ActionHandler {
	onCellClicked(x: number, y: number) {
		if (modalStack.present > 0) {
			return;
		}
		if (get(tour).running) {
			return;
		}

		let oldMenu = get(landmenu);

		if (oldMenu) {
			landmenu.set(undefined);
			return;
		}
		let menu:
			| {
					cell: ViewCellData;
					x: number;
					y: number;
					owner: `0x${string}`;
			  }
			| undefined;

		const player = account.$state.address;
		if (!player) {
			console.log('no account');
			return; // TODO
		}

		const currentState = get(stratagemsView);
		const currentOffchainState = get(accountData.offchainState);
		const $epochState = get(epochState);

		const cellID = xyToXYID(x, y);

		const currentColor = currentOffchainState.currentColor.color || Number((BigInt(player) % 5n) + 1n);

		if (currentOffchainState.moves?.epoch && currentOffchainState.moves.epoch != $epochState.epoch) {
			accountData.resetOffchainMoves($epochState.epoch);
		}
		const currentMove = currentOffchainState.moves?.list.find((v) => v.x === x && v.y === y);
		if (currentMove) {
			if (!$epochState.isActionPhase) {
				info.setRevealPhase();
				return;
			}

			accountData.removeMove(x, y);
			if (currentMove.color !== Color.None && currentMove.color !== currentColor) {
				accountData.addMove({x, y, color: currentColor, player}, $epochState.epoch);
			}
		} else {
			if (
				currentState.cells[cellID] &&
				currentState.owners[cellID]?.toLowerCase() === account.$state.address?.toLowerCase() &&
				currentState.viewCells[cellID].next.life === 7 // TODO MAX_LIFE
			) {
				if (!$epochState.isActionPhase) {
					info.setRevealPhase();
					return;
				}
				menu = {
					x,
					y,
					cell: currentState.viewCells[cellID],
					owner: currentState.owners[cellID],
				};
			} else if (
				currentState.cells[cellID] &&
				currentState.owners[cellID]?.toLowerCase() === account.$state.address?.toLowerCase() &&
				currentState.viewCells[cellID].next.life === 0 // TODO MAX_LIFE
			) {
				if (!$epochState.isActionPhase) {
					info.setRevealPhase();
					return;
				}
				if (currentOffchainState.moves?.list.length >= 30) {
					info.setMaxMovesReached();
					return;
				}
				accountData.addMove({x, y, color: currentColor, player}, $epochState.epoch);
			} else if (
				currentState.cells[cellID] &&
				currentState.owners[cellID]?.toLowerCase() !== account.$state.address?.toLowerCase() &&
				currentState.owners[cellID]?.toLowerCase() !== zeroAddress
			) {
				menu = {
					x,
					y,
					cell: currentState.viewCells[cellID],
					owner: currentState.owners[cellID],
				};
			} else {
				if (!$epochState.isActionPhase) {
					info.setRevealPhase();
					return;
				}
				if (currentOffchainState.moves?.list.length >= 30) {
					info.setMaxMovesReached();
					return;
				}
				accountData.addMove({x, y, color: currentColor, player}, $epochState.epoch);
			}
		}

		if (menu) {
			landmenu.set(menu);
		} else {
			landmenu.set(undefined);
		}
	}
}

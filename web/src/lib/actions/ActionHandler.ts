import {stratagemsView} from '$lib/state/ViewState';
import {account, accountData} from '$lib/blockchain/connection';

import {xyToXYID, Color} from 'stratagems-common';
import {get} from 'svelte/store';
import {epochState} from '$lib/state/Epoch';
import {tour} from '$lib/ui/tour/drive';
import {info} from '$lib/ui/information/info';
import {modalStack} from '$utils/ui/modals/ModalContainer.svelte';

export class ActionHandler {
	onCellClicked(x: number, y: number) {
		if (modalStack.present > 0) {
			return;
		}
		if (get(tour).running) {
			return;
		}
		console.log(x, y);
		const player = account.$state.address;
		if (!player) {
			console.log('no account');
			return; // TODO
		}

		const currentState = get(stratagemsView);
		const currentOffchainState = get(accountData.offchainState);
		const $epochState = get(epochState);

		if (!$epochState.isActionPhase) {
			info.setRevealPhase();
			return;
		}

		const cellID = xyToXYID(x, y);

		const currentColor = currentOffchainState.currentColor.color || Number((BigInt(player) % 5n) + 1n);

		console.log({x, y, cellID});

		console.log(currentState.cells[cellID]);
		console.log(currentState.owners[cellID]);

		if (currentOffchainState.moves?.epoch != $epochState.epoch) {
			accountData.resetOffchainMoves();
		}
		const currentMove = currentOffchainState.moves?.list.find((v) => v.x === x && v.y === y);
		if (currentMove) {
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
				console.log(`remove cell at ${x}, ${y}, ${player}`);
				accountData.addMove({x, y, color: Color.None, player}, $epochState.epoch);
			} else if (currentState.cells[cellID] && currentState.viewCells[cellID].next.life !== 0) {
				throw new Error(`Cell already occupied`);
			} else {
				console.log(`add color at ${x}, ${y}, ${player}`);
				accountData.addMove({x, y, color: currentColor, player}, $epochState.epoch);
			}
		}
	}
}

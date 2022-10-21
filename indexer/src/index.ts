import {fromSingleJSONEventProcessorObject, SingleJSONEventProcessorObject} from 'ethereum-indexer-json-processor';

import {logs} from 'named-logs';

import {Data, Cell, Player} from './types/data';
import {CommitmentMade, CommitmentResolved, CommitmentVoid, ReserveDeposited, ReserveWithdrawn} from './types/events';
import {positionToXYID} from './utils';

export type {Data, Cell, Player, CellColor} from './types/data';
export * from './types/events';

export * from './utils';

const namedLogger = logs('GameIndexer');

function getPlayer(json: Data, address: string): Player {
	let existing = json.players[address];
	if (!existing) {
		existing = json.players[address] = {
			address: address,
			lastUnresolvedCommitmentPeriod: 0,
			reserve: '0',
		};
	}
	return existing;
}

function getOrCreateCell(json: Data, position: string): Cell {
	const positionID = positionToXYID(position);
	let cell: Cell = json.cells[positionID];
	if (!cell) {
		cell = json.cells[positionID] = {
			owner: null,
			color: 0,
		};
	}
	return cell;
}

const GameIndexerProcessor: SingleJSONEventProcessorObject<Data> = {
	async setup(json: Data): Promise<void> {
		json.cells = {};
		json.players = {};
		// namedLogger.info(`setup complete!`);
	},

	onCommitmentMade(json: Data, event: CommitmentMade) {
		namedLogger.info(`CommitmentMade: ${JSON.stringify(event)}`);
		const playerAddress = event.args.player.toLowerCase();
		const existing = getPlayer(json, playerAddress);
		existing.lastUnresolvedCommitmentPeriod = event.args.period;
	},
	onCommitmentVoid(json: Data, event: CommitmentVoid) {
		namedLogger.info(`CommitmentVoid: ${JSON.stringify(event)}`);
		const playerAddress = event.args.player.toLowerCase();
		const existing = getPlayer(json, playerAddress);
		existing.lastUnresolvedCommitmentPeriod = 0;
	},
	onCommitmentResolved(json: Data, event: CommitmentResolved) {
		namedLogger.info(`CommitmentResolved: ${JSON.stringify(event)}`);
		const playerAddress = event.args.player.toLowerCase();
		const existing = getPlayer(json, playerAddress);
		existing.lastUnresolvedCommitmentPeriod = 0;
		namedLogger.log(event.args.moves);
		for (const move of event.args.moves) {
			const cell = getOrCreateCell(json, move.position);
			cell.owner = event.args.player;
			cell.color = move.color;
		}
	},
	onReserveWithdrawn(json: Data, event: ReserveWithdrawn) {
		namedLogger.info(`ReserveWithdrawn: ${JSON.stringify(event)}`);
		const playerAddress = event.args.player.toLowerCase();
		const existing = getPlayer(json, playerAddress);
		existing.reserve = (BigInt(existing.reserve) - BigInt(event.args.amount)).toString();
	},
	onReserveDeposited(json: Data, event: ReserveDeposited) {
		namedLogger.info(`ReserveDeposited: ${JSON.stringify(event)}`);
		const playerAddress = event.args.player.toLowerCase();
		const existing = getPlayer(json, playerAddress);
		existing.reserve = (BigInt(existing.reserve) + BigInt(event.args.amount)).toString();
	},
};

export const processor = fromSingleJSONEventProcessorObject(() => GameIndexerProcessor);

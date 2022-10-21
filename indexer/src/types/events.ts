import {EventWithId} from 'ethereum-indexer-json-processor';
import {CellColor} from './data';

export type CommitmentMade = EventWithId<{
	player: string;
	period: number;
	commitmentHash: string;
}>;
export type CommitmentVoid = EventWithId<{
	player: string;
	period: number;
	amountBurnt: string;
}>;

export type Move = {
	position: string;
	color: CellColor;
};

export type CommitmentResolved = EventWithId<{
	player: string;
	period: number;
	commitmentHash: string;
	moves: Move[];
	furtherMoves: string;
}>;

export type ReserveWithdrawn = EventWithId<{
	player: string;
	amount: string;
}>;
export type ReserveDeposited = EventWithId<{
	player: string;
	amount: string;
}>;

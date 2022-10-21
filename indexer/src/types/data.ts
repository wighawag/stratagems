export type CellColor = 0 | 1 | 2 | 3 | 4;

export type Cell = {
	owner: string | null;
	color: CellColor;
};

export type Player = {
	address: string;
	lastUnresolvedCommitmentPeriod: number;
	reserve: string;
};

export type Data = {
	cells: {[pos: string]: Cell};
	players: {[address: string]: Player};
};

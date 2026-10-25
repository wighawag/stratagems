export enum Color {
	None = 0,
	Blue = 1, // 5ab9bb
	Red = 2, // c5836e
	Green = 3, // 8bffcb
	Yellow = 4, // d3d66d
	Purple = 5, // a9799d
	Evil = 6, // 3d3d3d
}

export type ContractCell = {
	lastCycleUpdate: number;
	cycleWhenTokenIsAdded: number;
	color: number;
	life: number;
	delta: number;
	enemyMap: number;
	distribution: number;
	stake: number;
	producingCycles: number;
};

export type ContractFullCell = ContractCell & {
	owner: `0x${string}`;
};

export type StratagemsState = {
	cells: {[position: string]: ContractCell};
	owners: {[position: string]: `0x${string}`};
	computedPoints: {[owner: string]: number};
	/** each cell as it stood before the first move on it in a cycle (the contract's `_cellsAtCycleStart`) */
	cellsAtCycleStart?: {[position: string]: CellAtCycleStart};
};

export type CellAtCycleStart = {owner: `0x${string}`; cycle: number; life: number};

export type ContractMove = {position: bigint; color: Color};

export type CellXYPosition = {
	x: number;
	y: number;
};

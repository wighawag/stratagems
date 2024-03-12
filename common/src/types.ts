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
	lastEpochUpdate: number;
	epochWhenTokenIsAdded: number;
	color: number;
	life: number;
	delta: number;
	enemyMap: number;
	distribution: number;
	stake: number;
	producingEpochs: number;
};

export type ContractFullCell = ContractCell & {
	owner: `0x${string}`;
};

export type StratagemsState = {cells: {[position: string]: ContractCell}; owners: {[position: string]: `0x${string}`}};

export type ContractMove = {position: bigint; color: Color};

export type CellXYPosition = {
	x: number;
	y: number;
};

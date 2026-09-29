import type contractsInfo from './contracts';

type Contracts = (typeof contractsInfo)['contracts'];

/**
 * The ABI the processor's handlers are typed against: the two contracts whose
 * events it folds. A TYPE only: nothing at run time imports `./contracts`, so the
 * processor bundle carries no address and no ABI, and one bundle serves every
 * deployment (what to index is the SOURCE, `./source.ts`).
 */
export type StratagemsABI = [...Contracts['Stratagems']['abi'], ...Contracts['GemsGenerator']['abi']];

/**
 * STRATAGEMS' TABLES: where its factory is, and what a table's deployment
 * record is (`$lib/game/lobby/table`'s `TableLobby`, exported as `lobby` by
 * `./game.ts`). Step L2 of work/plans/join-template-commit-reveal.md, PL2-5.
 *
 * A table is the world's record with `Stratagems` at the table's address: the
 * ABI of the implementation it is a clone of (the world's routes plus the
 * base's `CommitRevealLobby`), and the config every table plays by, which
 * `contracts/deploy/021_deploy_tables.ts` records on the factory. Three more
 * names are swapped, because each is a contract of its own that the world's
 * record points at the WORLD'S:
 *
 * - `StratagemsSimulation`: the table's, built with the table's config, so the
 *   preview runs the rules a table plays by;
 * - `GemsGenerator`: `NoRewards`, so the indexer folds no points (a table has
 *   none, by design: PL2-2);
 * - the publication: none, which is the context's to skip (`createIndexedBoard`
 *   at a table), since a table's record has the world's name.
 *
 * Everything else (the tokens, the distributor) is the world's.
 */
import type {TypedDeployments} from '$lib/deployments-store';
import type {TableLobby} from '$lib/game/lobby/table';

type Contract = {address: `0x${string}`; abi: unknown; linkedData?: unknown};

function contractNamed(deployments: TypedDeployments, name: string): Contract {
	const contract = (
		deployments.contracts as unknown as Record<string, Contract>
	)[name];
	if (!contract) {
		throw new Error(
			`this deployment has no ${name}: its tables are deployed by contracts/deploy/021_deploy_tables.ts`,
		);
	}
	return contract;
}

/**
 * Whether `name` is one of the contracts `021_deploy_tables.ts` deploys, which
 * the offline world does not (an in-tab chain has nobody to invite: PL2-3).
 */
export function isTableContract(name: string): boolean {
	return name.startsWith('StratagemsTable') || name === 'NoRewards';
}

/** Whether this deployment has tables at all (the offline world has none). */
export function hasTables(deployments: TypedDeployments): boolean {
	return 'StratagemsTableFactory' in deployments.contracts;
}

export const stratagemsLobby: TableLobby = {
	factory: (deployments) =>
		contractNamed(deployments, 'StratagemsTableFactory'),
	deploymentsAt(deployments, table) {
		const implementation = contractNamed(
			deployments,
			'StratagemsTableImplementation',
		);
		const factory = contractNamed(deployments, 'StratagemsTableFactory');
		return {
			...deployments,
			contracts: {
				...deployments.contracts,
				Stratagems: {
					...implementation,
					address: table,
					linkedData: factory.linkedData,
				},
				StratagemsSimulation: contractNamed(
					deployments,
					'StratagemsTableSimulation',
				),
				GemsGenerator: contractNamed(deployments, 'NoRewards'),
			},
		} as unknown as TypedDeployments;
	},
};

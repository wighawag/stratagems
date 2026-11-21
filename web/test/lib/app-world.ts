import deployTestTokens from 'stratagems-contracts/deploy/001_deploy_test_tokens.js';
import deployDistributor from 'stratagems-contracts/deploy/002_deploy_test_tokens_distributor.js';
import deployGems from 'stratagems-contracts/deploy/010_deploy_gems.js';
import deployGenerator from 'stratagems-contracts/deploy/011_deploy_gems_generator.js';
import deployGame from 'stratagems-contracts/deploy/020_deploy_game.js';
import deployTables from 'stratagems-contracts/deploy/021_deploy_tables.js';

/**
 * WHAT AN EMBEDDED WORLD MUST DEPLOY for the app's context to work, and the
 * rocketh setup it deploys with, in ONE place, so a descendant that replaces
 * the app's contracts (its own contracts package, its own deploy scripts)
 * edits this file and not every suite that boots a world. Read by
 * `embedded/world.test.ts` and `embedded/deployments.test.ts`. Its e2e twin is
 * `MAIN_PAGE` of `web/e2e/routes.ts`, whose `contract` names the same contract.
 *
 * HERE, STRATAGEMS' CONTRACTS. Its `embedded/world.test.ts` is its own: it
 * boots `OFFLINE_DEPLOYMENT` of `$lib/offline` whole. What reads this file is
 * the stem's `offline-world.test.ts`, which opens a world of these deploy
 * scripts at their default data (every contract the app's records name, so
 * the world's own check passes) and checks the opener, not the game.
 */
export {config, extensions} from 'stratagems-contracts/rocketh/config.js';

/** The deploy scripts a world runs, in order (as `OFFLINE_DEPLOYMENT` of `$lib/offline` deploys). */
export const APP_SCRIPTS = [
	{id: '001_deploy_test_tokens', module: deployTestTokens},
	{id: '002_deploy_test_tokens_distributor', module: deployDistributor},
	{id: '010_deploy_gems', module: deployGems},
	{id: '011_deploy_gems_generator', module: deployGenerator},
	{id: '020_deploy_game', module: deployGame},
	{id: '021_deploy_tables', module: deployTables},
];

/**
 * The deployment name of the contract the app's context reads: stratagems'
 * game is the `Stratagems` contract, not the template's `Game`.
 */
export const APP_CONTRACT = 'Stratagems' as const;

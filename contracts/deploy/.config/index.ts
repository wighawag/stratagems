import type {Environment} from '../../rocketh/config.js';

/** What the deploy scripts decide from the environment they run in. */
export function getConfig(env: Pick<Environment, 'name' | 'tags'>) {
	return {
		useTimeContract: !env.tags['mainnet'] && !(env.name === 'fast'),
	};
}

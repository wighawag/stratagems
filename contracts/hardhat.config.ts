import {loadEnv} from 'ldenv';
loadEnv();
import '@nomicfoundation/hardhat-network-helpers';
import 'solidity-coverage';
import 'hardhat-rocketh';
import 'solidity-docgen';
import {addForkConfiguration, addNetworksFromEnv} from 'hardhat-rocketh';

const defaultVersion = '0.8.20';
const defaultSettings = {
	optimizer: {
		enabled: true,
		runs: 999999,
	},
};
export default {
	solidity: {
		compilers: [
			{
				version: defaultVersion,
				settings: {...defaultSettings},
			},
		],
		overrides: {
			'src/game/routes/StratagemsCore.sol': {
				version: '0.8.19',
				settings: {
					...defaultSettings,
					metadata: {
						appendCBOR: false,
					},
				},
			},
		},
	},
	networks:
		// this setup forking for netwoirk if env var HARDHAT_FORK is set
		addForkConfiguration(
			// this add network for each respective env var found (ETH_NODE_URI_<network>)
			addNetworksFromEnv({
				hardhat: {
					initialBaseFeePerGas: 0,
					mining: {
						interval: process.env['BLOCK_TIME'] ? parseInt(process.env['BLOCK_TIME']) : undefined,
					},
				},
			})
		),
	paths: {
		sources: 'src',
	},
	docgen: {
		templates: 'docs_templates',
		pages: 'files',
	},
};

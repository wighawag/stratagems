import type {HardhatUserConfig} from 'hardhat/config';
import {loadEnv} from 'ldenv';

import HardhatNodeTestRunner from '@nomicfoundation/hardhat-node-test-runner';
import HardhatViem from '@nomicfoundation/hardhat-viem';
import HardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';
import HardhatDeploy from 'hardhat-deploy';
import HardhatExternalArtifactsPlugin from 'hardhat-external-artifacts';
import {addForkConfiguration, addNetworksFromEnv} from 'hardhat-deploy/helpers';

loadEnv();

// `pnpm local_node` mines on a timer when BLOCK_TIME (seconds) is set, and on every
// transaction otherwise. Only the `node` network: the tests keep instant mining.
const blockTime = process.env['BLOCK_TIME'] ? parseInt(process.env['BLOCK_TIME']) : undefined;

// ONE set of compiler settings for every profile: `hardhat deploy` to a live network
// compiles with the `production` profile, and without viaIR the game does not compile
// (stack too deep). Deployed bytecode must also be what the tests ran.
const compilerSettings = {
	optimizer: {
		enabled: true,
		runs: 999999,
	},
	viaIR: true,
	outputSelection: {
		'*': {
			'*': ['evm.methodIdentifiers'],
		},
	},
};

const config: HardhatUserConfig = {
	plugins: [HardhatNodeTestRunner, HardhatViem, HardhatNetworkHelpers, HardhatDeploy, HardhatExternalArtifactsPlugin],
	solidity: {
		profiles: {
			default: {
				version: '0.8.24',
				settings: compilerSettings,
			},
			production: {
				version: '0.8.24',
				settings: compilerSettings,
			},
		},
	},
	networks:
		// the fork configuration for the network named by HARDHAT_FORK
		addForkConfiguration(
			// a network for each ETH_NODE_URI_<network> found (MNEMONIC_<network> gives its accounts)
			addNetworksFromEnv({
				// in-process, instant mining: `pnpm test`
				default: {
					type: 'edr-simulated',
					chainType: 'l1',
					allowUnlimitedContractSize: true,
					initialBaseFeePerGas: 0n,
				},
				// the commit-reveal base's suite (test/js, Hardhat's node test runner), as the stem has it
				test: {
					type: 'edr-simulated',
					chainType: 'l1',
					allowBlocksWithSameTimestamp: true,
				},
				// `pnpm local_node` (hardhat node): what `localhost` connects to
				node: {
					type: 'edr-simulated',
					chainType: 'l1',
					allowUnlimitedContractSize: true,
					initialBaseFeePerGas: 0n,
					// WITHOUT THIS THE CHAIN RUNS AHEAD OF THE WALL CLOCK, as the template's
					// `local` network says: every automined transaction needs a block with a
					// timestamp later than the last, so a burst (the deploy, an e2e run's
					// suites) pushes block time ahead one second per block. Measured
					// 2026-10-26 on the e2e chain: 30 s ahead before the first test, and a
					// reveal the client sent in what its clock called the reveal phase
					// reverted, the chain's cycle having moved past it.
					allowBlocksWithSameTimestamp: true,
					...(blockTime ? {mining: {auto: true, interval: blockTime * 1000}} : {}),
				},
			}),
		),
	paths: {
		sources: ['src'],
		tests: {
			nodejs: 'test/js',
		},
	},
	generateTypedArtifacts: {
		destinations: [
			{
				folder: './generated',
				mode: 'typescript',
			},
		],
	},
	externalArtifacts: {
		modules: ['@rocketh/proxy/artifacts'],
	},
};

export default config;

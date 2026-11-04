import type {HardhatUserConfig} from 'hardhat/config';

import HardhatNodeTestRunner from '@nomicfoundation/hardhat-node-test-runner';
import HardhatViem from '@nomicfoundation/hardhat-viem';
import HardhatNetworkHelpers from '@nomicfoundation/hardhat-network-helpers';
import HardhatKeystore from '@nomicfoundation/hardhat-keystore';

import HardhatDeploy from 'hardhat-deploy';
import HardhatExternalArtifactsPlugin from 'hardhat-external-artifacts';
import {
	addForkConfiguration,
	addNetworksFromEnv,
	addNetworksFromKnownList,
} from 'hardhat-deploy/helpers';

const config: HardhatUserConfig = {
	plugins: [
		HardhatNodeTestRunner,
		HardhatViem,
		HardhatNetworkHelpers,
		HardhatKeystore,
		HardhatDeploy,
		HardhatExternalArtifactsPlugin,
	],
	solidity: {
		profiles: {
			// conquest targets chains that are not guaranteed to be past the
			// london fork, so every profile pins evmVersion rather than
			// following solc's default.
			default: {
				version: '0.8.28',
				// A solc to use instead of downloading one, for a build with no
				// network (the Nix package for a LAN box, nix/lan.nix, gives it the
				// official WASM build). Keep it in step with `version`.
				path: process.env.SOLC_PATH || undefined,
				settings: {
					evmVersion: 'london',
				},
			},
			production: {
				version: '0.8.28',
				path: process.env.SOLC_PATH || undefined,
				settings: {
					optimizer: {
						enabled: true,
						runs: 999999,
					},
					evmVersion: 'london',
				},
			},
		},
	},
	networks:
		// This add the fork configuration for chosen network
		addForkConfiguration(
			// This add the fork configuration for chosen network
			addForkConfiguration(
				// this add a network config for all known chain using kebab-cases names
				// Note that MNEMONIC_<network> (or MNEMONIC if the other is not set) will
				// be used for account
				// Similarly ETH_NODE_URI_<network> will be used for rpcUrl
				// Note that if you set these env variable to have the value: "SECRET" it will be like using:
				//  configVariable('SECRET_ETH_NODE_URI_<network>')
				//  configVariable('SECRET_MNEMONIC_<network>')
				addNetworksFromKnownList(
					// this add network for each respective env var found (ETH_NODE_URI_<network>)
					// it will also read MNEMONIC_<network> to populate the accounts
					// And like above it will use configVariable if set to SECRET
					addNetworksFromEnv({
						// and you can add in your specific network here
						default: {
							type: 'edr-simulated',
							chainType: 'l1',
							// the game advances by cycles, so several blocks may
							// legitimately share a timestamp
							allowBlocksWithSameTimestamp: true,
							gasPrice: 1n,
							mining: {
								interval: 1000,
							},
							accounts: {
								mnemonic: process.env.MNEMONIC || undefined,
							},
						},
						local: {
							type: 'edr-simulated',
							chainType: 'l1',
							allowBlocksWithSameTimestamp: true,
							accounts: {
								mnemonic: process.env.MNEMONIC || undefined,
							},
							// this prevent EDR from not mining tx that fails
							throwOnTransactionFailures: false,
							// ONE SECOND, and it is the app's clock that needs it.
							//
							// Cycles are defined against `block.timestamp`, and the web
							// client's clock interpolates from the wall clock between
							// blocks (`game/core/chain-time.ts`), so the client crosses a
							// cycle boundary as soon as real time says so while the chain
							// only crosses when a block carries a later timestamp. Every
							// second of the mining interval is a second of that gap, and
							// the gap is what produces both of the faults the refresh
							// policy in `onchain/state.ts` exists to absorb: a board stuck
							// showing the previous cycle at every boundary, and a reveal
							// landing in the gap appearing seconds into the next window.
							//
							// A deployed chain has its own block time and this is not a
							// substitute for handling that - the client must cope either
							// way, which is what the refresh policy is for. This is the
							// dev node being made to behave more like a real one.
							mining: {
								interval: 1000,
							},
						},
						// instant-mining network used by `pnpm test`
						test: {
							type: 'edr-simulated',
							chainType: 'l1',
							allowBlocksWithSameTimestamp: true,
						},
					}),
				),
			),
		),
	paths: {
		// `src` is production code only. Tests live under `test`, split by the
		// language they are written in: Solidity tests exercise a contract from
		// inside the EVM (cheatcodes, storage slots, fuzzing), TypeScript ones
		// exercise it the way the app does, across the ABI boundary.
		sources: ['src'],
		tests: {
			solidity: 'test/solidity',
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

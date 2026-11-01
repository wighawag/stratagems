// ----------------------------------------------------------------------------
// Typed Config
// ----------------------------------------------------------------------------
import type {EnhancedEnvironment, UnknownDeployments, UserConfig} from 'rocketh/types';

// a private key as an account (`privateKey:0x...`)
import {privateKey} from '@rocketh/signer';
import {parseEther} from 'viem';
import {CLIENT_GAS} from '../deploy/.config/gas.js';

export const config = {
	accounts: {
		deployer: {
			default: 0,
		},
		tokensBeneficiary: {
			default: 1,
		},
		timeOwner: {
			default: 0,
		},
	},
	// the deploy scripts branch on these tags (`deploy/.config`)
	environments: {
		// the local dev node (`pnpm local_node`)
		localhost: {
			chain: 31337,
		},
		alpha1: {
			chain: 8453,
			overrides: {tags: ['mainnet']},
		},
		base: {
			chain: 8453,
			overrides: {tags: ['mainnet']},
		},
		// THE NEW DEPLOYMENT (step D of work/plans/join-template-commit-reveal.md):
		// the contracts on the commit-reveal base, on Base, beside alpha1's
		// records, with fresh tokens, a test-gems distributor and alpha1's day-long
		// cycle. `alpha1` and `base` above are history.
		alpha2: {
			chain: 8453,
			overrides: {tags: ['mainnet']},
		},
		// A BOX ON THE LAN (step L2, PL2-8): the user's `ethereum-lan-node`, geth
		// in dev mode with a block every 2 s, chain 19216801. Deployed from the
		// user's machine with `ETH_NODE_URI_lan` and `MNEMONIC_lan` (the box's
		// genesis funds the `test ... junk` mnemonic). DETERMINISTIC, through the
		// CREATE2 proxy the box predeploys, so a static build's addresses hold on
		// every box and after every reset of its chain.
		lan: {
			chain: 19216801,
			overrides: {tags: ['deterministic']},
		},
	},
	chains: {
		// The local chain (`pnpm local_node`, the e2e), with the two properties the
		// template's client prices the browser's key with, exported with the
		// deployments and read by the web app (as the template's config declares
		// them): `expectedWorstGasPrice` sizes the gas stipend the stake forwards
		// to the key (`addToReserveAndFund`), and `creditsGasMultiplier`, the gas of
		// one commit plus one reveal step, shows the key's balance as moves left
		// rather than as ether. A live chain declares its own at step D.
		31337: {
			properties: {
				expectedWorstGasPrice: parseEther('1', 'gwei'),
				creditsGasMultiplier: CLIENT_GAS.commitGas + CLIENT_GAS.revealGas,
				supportsSendRawTransactionSync: false,
			},
		},
		// THE LAN BOX (`lan` above): geth's dev mode prices like a local chain,
		// so the local chain's properties; its genesis is reset when the box is,
		// which the deterministic deploys survive and the records must follow.
		19216801: {
			info: {
				id: 19216801,
				name: 'Ethereum LAN node',
				nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
				rpcUrls: {default: {http: ['http://localhost:8545']}},
			},
			deleteDeploymentsIfDifferentGenesisHash: true,
			properties: {
				expectedWorstGasPrice: parseEther('1', 'gwei'),
				creditsGasMultiplier: CLIENT_GAS.commitGas + CLIENT_GAS.revealGas,
				supportsSendRawTransactionSync: false,
			},
		},
		// Base (step D, PD6): the base fee sat at 0.005 gwei in every one of 1,024
		// blocks measured on 2026-10-30, the 99th-percentile tip reaching 3.2 gwei
		// in a spike. 0.02 gwei is four times the base fee: it sizes the stake's
		// stipend (`signerStipend`: this price x (commitGas + revealGas) x 100 turns,
		// 0.0143 ETH) and is the most fuzd is authorised to pay per gas for a
		// scheduled reveal. A spike above it leaves fuzd's reveal waiting, which the
		// browser's fallback at half the reveal phase covers.
		8453: {
			properties: {
				expectedWorstGasPrice: parseEther('0.02', 'gwei'),
				creditsGasMultiplier: CLIENT_GAS.commitGas + CLIENT_GAS.revealGas,
				supportsSendRawTransactionSync: false,
			},
		},
	},
	data: {},
	signerProtocols: {
		privateKey,
	},
} as const satisfies UserConfig;

// ----------------------------------------------------------------------------
// Imports and configure the extensions the deploy scripts use
// ----------------------------------------------------------------------------
// deploy
import * as deployExtension from '@rocketh/deploy';
// read, execute
import * as readExecuteExtension from '@rocketh/read-execute';
// deployViaProxy
import * as deployProxyExtension from '@rocketh/proxy';
// deployViaRouter
import * as deployRouterExtension from '@rocketh/router';
// viem clients and contracts
import * as viemExtension from '@rocketh/viem';

const extensions = {
	...deployExtension,
	...readExecuteExtension,
	...deployProxyExtension,
	...deployRouterExtension,
	...viemExtension,
};
export {extensions};

type Extensions = typeof extensions;
type Accounts = typeof config.accounts;
type Data = typeof config.data;
type Environment = EnhancedEnvironment<Accounts, Data, UnknownDeployments, Extensions>;

export type {Extensions, Accounts, Data, Environment};

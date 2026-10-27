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

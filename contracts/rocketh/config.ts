// ----------------------------------------------------------------------------
// Typed Config
// ----------------------------------------------------------------------------
import type {EnhancedEnvironment, UnknownDeployments, UserConfig} from 'rocketh/types';

// a private key as an account (`privateKey:0x...`)
import {privateKey} from '@rocketh/signer';
import {base} from 'viem/chains';
import {parseEther} from 'viem';
import {CLIENT_GAS} from '../deploy/.config/gas.js';

// Base, as viem describes it, WITHOUT its formatters and serializers. Those are
// functions, so `rocketh-export` writes them as `{"type": "block"}` residue, and
// that residue is a chain type no viem client accepts: since stratagems joined
// template-commit-reveal, the framework's `web/src/lib/deployments.ts` is typed
// from this export, and with the residue `pnpm --filter ./web check` reports 19
// errors in the framework (2026-10-24, work/plans/join-template-commit-reveal.md,
// step 4). Nothing read them: the residue has no `format` to call, so viem used
// its own formatting all along. Delete this once `@rocketh/export` drops
// function-valued chain fields itself.
// Set to `undefined` rather than left out, because rocketh merges this entry over
// its own copy of viem's chain, which would put them back.
const baseWithoutFunctions = {...base, formatters: undefined, serializers: undefined};

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
		8453: {info: {...baseWithoutFunctions, chainType: 'op-stack'}},
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

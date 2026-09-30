import {type Accounts, type Data, type Extensions, extensions} from './config.js';
import {setupEnvironmentFromFiles} from '@rocketh/node';
import {setupHardhatDeploy} from 'hardhat-deploy/helpers';

// the artifacts, re-exported so tests and scripts get them from one place
import * as artifacts from '../generated/artifacts/index.js';
export {artifacts};

// for tests and scripts: reads the deploy scripts and the deployments from the file system
const {loadAndExecuteDeploymentsFromFiles, loadEnvironmentFromFiles} = setupEnvironmentFromFiles<
	Extensions,
	Accounts,
	Data
>(extensions);
const {loadEnvironmentFromHardhat} = setupHardhatDeploy<Extensions, Accounts, Data>(extensions);

export {loadEnvironmentFromHardhat, loadEnvironmentFromFiles, loadAndExecuteDeploymentsFromFiles};

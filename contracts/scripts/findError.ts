import hre from 'hardhat';
import {loadEnvironmentFromHardhat} from '../rocketh/environment.js';
import {AbiItem, toFunctionSelector, zeroAddress} from 'viem';
import {formatAbiItem} from 'abitype';

async function main(selector: string) {
	const env = await loadEnvironmentFromHardhat({hre});

	let found: AbiItem | undefined;
	let deploymentName: string | undefined;
	for (deploymentName of Object.keys(env.deployments)) {
		const deployment = env.deployments[deploymentName];
		for (const abiItem of deployment.abi) {
			if (abiItem.type === 'error') {
				const errorSelector = toFunctionSelector(formatAbiItem(abiItem));
				if (errorSelector == selector) {
					found = abiItem;
					break;
				}
				console.log(`${deploymentName}: ${errorSelector}`);
			}
		}
		if (found) {
			break;
		}
	}

	if (deploymentName) {
		console.log(deploymentName, found);
	}
}

const args = process.argv.slice(2);
main(args[0]);

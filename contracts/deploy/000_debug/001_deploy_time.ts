import SolidityKit from 'solidity-kit/generated/artifacts.js';
import {deployScript} from '../../rocketh/deploy.js';
import {getConfig} from '../.config/index.js';

const timeSalts = {
	composablelabs: '0x000000000000000000000000000000000000636F6D706F7361626C656C616273',
	sepolia: '0x000000000000000000000000000000000000000000000000007365706F6C6961',
};

export default deployScript(
	async (env) => {
		const {deploy, namedAccounts} = env;
		const deterministic = (timeSalts[env.name as keyof typeof timeSalts] as `0x${string}` | undefined) || true;
		const deployConfig = getConfig(env);
		if (deployConfig.useTimeContract) {
			await deploy(
				'Time',
				{
					account: namedAccounts.deployer,
					artifact: SolidityKit.Time,
					args: [namedAccounts.timeOwner],
				},
				{deterministic, skipIfAlreadyDeployed: true},
			);
		}
	},
	{tags: ['Time', 'Time_deploy']},
);

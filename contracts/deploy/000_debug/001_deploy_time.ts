import {execute} from 'rocketh';
import '@rocketh/deploy';
import {context} from '../_context';
import SolidityKit from 'solidity-kit/generated/artifacts';
import {getConfig} from '../.config';

const timeSalts = {
	composablelabs: '0x000000000000000000000000000000000000636F6D706F7361626C656C616273',
	sepolia: '0x000000000000000000000000000000000000000000000000007365706F6C6961',
};

export default execute(
	context,
	async (env) => {
		const {deploy, namedAccounts, artifacts, network} = env;
		const deterministic = timeSalts[network.name] || true;
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

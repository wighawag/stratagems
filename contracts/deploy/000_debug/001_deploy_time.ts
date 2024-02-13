import {execute} from 'rocketh';
import 'rocketh-deploy';
import {context} from '../_context';
import SolidityKit from 'solidity-kit/generated/artifacts';

const timeSalts = {
	composablelabs: '0x000000000000000000000000000000000000636F6D706F7361626C656C616273',
	sepolia: '0x000000000000000000000000000000000000000000000000007365706F6C6961',
};

export default execute(
	context,
	async ({deploy, accounts, artifacts, network}) => {
		const deterministic = timeSalts[network.name] || true;
		await deploy(
			'Time',
			{
				account: accounts.deployer,
				artifact: SolidityKit.Time,
				args: [accounts.timeOwner],
			},
			{deterministic},
		);
	},
	{tags: ['Time', 'Time_deploy']},
);

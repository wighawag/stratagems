import {execute} from 'rocketh';
import 'rocketh-deploy';
import {context} from '../_context';
import SolidityKit from 'solidity-kit/artifacts';

export default execute(
	context,
	async ({deploy, accounts, artifacts}) => {
		await deploy(
			'Time',
			{
				account: accounts.deployer,
				artifact: SolidityKit.Time,
				args: [accounts.timeOwner],
			},
			{deterministic: true},
		);
	},
	{tags: ['Time', 'Time_deploy']},
);

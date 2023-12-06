import {execute} from 'rocketh';
import 'rocketh-deploy';
import {context} from '../_context';
import SolidityKit from 'solidity-kit/generated/artifacts';

export default execute(
	context,
	async ({deploy, accounts, artifacts, network}) => {
		const deterministic =
			network.name === 'composablelabs'
				? '0x000000000000000000000000000000000000636F6D706F7361626C656C616273' /* "composablelabs" in hex */
				: true;
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

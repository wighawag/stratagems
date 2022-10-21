import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {days, minutes, nextSunday, timestamp} from '../utils/time';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployer} = await hre.getNamedAccounts();
	const {deploy, read} = hre.deployments;
	const useProxy = !hre.network.live;

	const Tokens = await hre.deployments.get('Tokens');

	const config = {
		tokens: Tokens.address,
		// startTime: nextSunday(),
		startTime: timestamp(), // nextSunday(),
		// commitPeriod: days(2.5), // TODO support more complex period to support a special weekend commit period
		commitPeriod: minutes(5), // days(2.5), // TODO support more complex period to support a special weekend commit period
		// resolutionPeriod: days(1),
		resolutionPeriod: minutes(5), // days(1),
		maxLife: 5,
		decimals: await read('Tokens', 'decimals'),
	};

	await deploy('Game', {
		from: deployer,
		proxy: useProxy,
		args: [config],
		log: true,
		autoMine: true,
		linkedData: config,
	});
};
export default func;
func.tags = ['Game', 'Game_deploy'];
func.dependencies = ['Tokens_deploy'];

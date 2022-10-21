import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
	const {deployer} = await hre.getNamedAccounts();
	const {deploy, read} = hre.deployments;
	const useProxy = !hre.network.live;

	await deploy('Dummy', {
		from: deployer,
		log: true,
		autoMine: true
	});

	return !useProxy; // when live network, record the script as executed to prevent rexecution
};
export default func;
func.id = 'deploy_dummy'; // id required to prevent reexecution
func.tags = ['Dummy', 'Dummy_deploy'];

import {constants} from 'ethers';
import {formatEther, parseEther} from 'ethers/lib/utils';
import {deployments, ethers, getNamedAccounts, getUnnamedAccounts} from 'hardhat';
import {composeCommitment, composeResolution} from '../test/setup';
import {getCurrentPeriodInfo, setTimestamp, waitForTx} from '../test/utils/time';
import {Game, Tokens} from '../typechain';
import {nextSunday} from '../utils/time';

function xyToPosition(x: number, y: number): string {
	const bn = BigInt(x) + (BigInt(y) << 32n);
	return bn.toString(10);
}

const cells = [
	{color: 1, x: 1, y: 3},
	{color: 1, x: 0, y: 3},
	{color: 1, x: 1, y: 4},
	{color: 2, x: 4, y: 2},
	{color: 2, x: 3, y: 2},
	{color: 3, x: 3, y: 0},
	{color: 3, x: 2, y: 0},
];

async function main() {
	try {
		await setTimestamp(nextSunday());
	} catch (err) {
		// console.log(err);
	}

	const GameDeployment = await deployments.get('Game');
	console.log('getting currentPeriod');
	const startPeriod = await getCurrentPeriodInfo(GameDeployment.linkedData);
	if (!startPeriod.commiting) {
		console.log(`not commit period`);
	}
	console.log(startPeriod);

	const players = await getUnnamedAccounts();
	const {tokensBeneficiary} = await getNamedAccounts();
	let i = 0;
	const txs = [];
	const commitments = [];
	for (const player of players) {
		const Tokens = await ethers.getContract<Tokens>('Tokens', player);
		const Game = await ethers.getContract<Game>('Game', player);

		const cell = cells.shift();
		if (!cell) {
			break;
		}

		const numTokens = parseEther('100');
		console.log('composing commitment....');
		const commitmentToAdd = await composeCommitment(Game, {
			numTokensToAddToReserve: numTokens,
			moves: [{position: xyToPosition(cell.x, cell.y), color: cell.color}],
		});
		commitments.push({commitment: commitmentToAdd, player});

		console.log('getting tokens in reserve....');
		const numTokensInReserve = await Game.callStatic.tokensInReserve(player);

		if (numTokensInReserve.lt(numTokens)) {
			console.log({
				numTokensInReserve: formatEther(numTokensInReserve),
				numTokens: formatEther(numTokens),
			});
			const BeneficiaryTokens = await ethers.getContract<Tokens>('Tokens', tokensBeneficiary);
			txs.push(await BeneficiaryTokens.transfer(player, numTokens));
			txs.push(await Tokens.approve(Game.address, constants.MaxUint256));
			txs.push(await commitmentToAdd.perform());
		}
		i++;
	}

	const period = await getCurrentPeriodInfo(GameDeployment.linkedData);
	console.log(period);
	if (period.commiting) {
		try {
			await setTimestamp(period.currentTimestamp + period.resolutionDelta);
		} catch (e) {
			console.error(e);
		}
	}

	for (const commit of commitments) {
		console.log({moves: commit.commitment.moves});
		const Game = await ethers.getContract<Game>('Game', commit.player);
		const resolution = await composeResolution(Game, {
			player: commit.player,
			secret: commit.commitment.secret,
			moves: commit.commitment.moves,
		});
		txs.push(await resolution.perform());
	}
	await Promise.all(txs);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

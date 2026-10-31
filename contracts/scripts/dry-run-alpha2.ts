/**
 * THE `alpha2` DEPLOYMENT, REHEARSED ON A FORK OF BASE (step D of
 * work/plans/join-template-commit-reveal.md, items 3 and PD5).
 *
 * Runs the deploy scripts under the `alpha2` environment against an in-process
 * fork of Base at its latest block, with nothing saved, then plays what a new
 * player does: one top-up of test gems, the one-transaction stake with its
 * stipend to a fresh browser key, the FIRST commit paying a fresh reveal
 * scheduler account (the dearest commit there is), the commit phase run out,
 * and the reveal. It prints the gas of each, against the budget in
 * `deploy/.config/gas.ts`, and exits non-zero if any falls within 10% of it.
 *
 * Needs the network: it reads Base's state from `ETH_NODE_URI_8453` (default
 * https://mainnet.base.org). Run it with
 * `pnpm --filter ./contracts exec hardhat run scripts/dry-run-alpha2.ts`.
 */
import {network} from 'hardhat';
import {createPublicClient, createWalletClient, custom, parseEther, keccak256, encodeAbiParameters} from 'viem';
import {privateKeyToAccount, generatePrivateKey} from 'viem/accounts';
import {loadAndExecuteDeploymentsFromFiles} from '../rocketh/environment.js';
import {CLIENT_GAS} from '../deploy/.config/gas.js';

const BASE_RPC = process.env.ETH_NODE_URI_8453 || 'https://mainnet.base.org';

const connection = await network.connect({
	network: 'default',
	chainType: 'op',
	override: {
		chainId: 8453,
		forking: {url: BASE_RPC},
		mining: {auto: true, interval: 0},
		gasPrice: 'auto',
		allowUnlimitedContractSize: false,
	},
});
const provider = connection.provider;

const env = await loadAndExecuteDeploymentsFromFiles({
	provider,
	environment: 'alpha2',
	saveDeployments: false,
});

const chain = {id: 8453} as any;
const publicClient = createPublicClient({chain, transport: custom(provider)});
const deployments = env.deployments as Record<string, {address: `0x${string}`; abi: any; linkedData?: any}>;
const names = Object.keys(deployments).sort();
console.log(`deployed under alpha2 on a fork of Base: ${names.join(', ')}`);
for (const required of ['TestTokens', 'TestTokensDistributor', 'Gems', 'GemsGenerator', 'Stratagems']) {
	if (!deployments[required]) throw new Error(`alpha2 did not deploy ${required}`);
}
const S = deployments.Stratagems;
const linked = S.linkedData;
console.log(
	`cycle: commit ${linked.commitPhaseDuration} s, reveal ${linked.revealPhaseDuration} s; actionsPerReveal ${linked.actionsPerReveal}; policy ${linked.cyclePolicy}`,
);

// A player that is not one of the deployer's accounts, funded with ETH on the fork.
const player = privateKeyToAccount(generatePrivateKey());
const browserKey = privateKeyToAccount(generatePrivateKey());
const freshPayee = privateKeyToAccount(generatePrivateKey()).address;
await provider.request({method: 'hardhat_setBalance', params: [player.address, '0xDE0B6B3A7640000']}); // 1 ETH
const wallet = (account: typeof player) => createWalletClient({account, chain, transport: custom(provider)});

async function send(label: string, account: typeof player, request: any): Promise<bigint> {
	const hash = await wallet(account).writeContract({...request, account, chain});
	const receipt = await publicClient.waitForTransactionReceipt({hash});
	if (receipt.status !== 'success') throw new Error(`${label} reverted`);
	console.log(`gas: ${label} ${receipt.gasUsed}`);
	return receipt.gasUsed;
}

// 1. test gems: one press
await send('topup', player, {address: deployments.TestTokensDistributor.address, abi: deployments.TestTokensDistributor.abi, functionName: 'topup'});
const gems = (await publicClient.readContract({
	address: deployments.TestTokens.address,
	abi: deployments.TestTokens.abi,
	functionName: 'balanceOf',
	args: [player.address],
})) as bigint;
console.log(`gems after one press: ${gems / 10n ** 18n}`);
const stake = BigInt(linked.actionsPerReveal) * 10n ** 18n;
if (gems < stake) throw new Error(`one press (${gems}) is less than a stake (${stake})`);

// 2. the stake, with a stipend to the browser's key (`addToReserveAndFund`)
const stipend = parseEther('0.0143');
await send('addToReserveAndFund (stake + stipend)', player, {
	address: S.address,
	abi: S.abi,
	functionName: 'addToReserveAndFund',
	args: [BigInt(player.address), stake, browserKey.address],
	value: stipend,
});
// the player authorises the browser key (the app's registration is a signature
// the key sends; the contract call it makes is the same record)
await send('registerDelegate', player, {
	address: S.address,
	abi: S.abi,
	functionName: 'registerDelegate',
	args: [browserKey.address, '0x0000000000000000000000000000000000000000'],
});

// 3. the first commit from the browser key, paying a fresh scheduler account
const cycle = (await publicClient.readContract({address: S.address, abi: S.abi, functionName: 'getCycle'})) as any;
if (!cycle.commiting) {
	await provider.request({method: 'evm_increaseTime', params: [Number(cycle.phaseEnd) - Math.floor(Date.now() / 1000) + 1]});
	await provider.request({method: 'evm_mine', params: []});
}
const SECRET = '0x00000000000000000000000000000000000000000000000000000000000000a1';
const moves = Array.from({length: Number(linked.actionsPerReveal) - 2}, (_, i) => ({
	position: BigInt(i * 2) + (7n << 32n),
	color: 1,
}));
const hash = keccak256(
	encodeAbiParameters(
		[
			{type: 'bytes32'},
			{type: 'tuple[]', components: [{name: 'position', type: 'uint64'}, {name: 'color', type: 'uint8'}]},
			{type: 'bytes24'},
		],
		[SECRET, moves, '0x000000000000000000000000000000000000000000000000'],
	),
).slice(0, 50) as `0x${string}`;
const commitUsed = await send('first commit, paying a fresh scheduler account', browserKey, {
	address: S.address,
	abi: S.abi,
	functionName: 'makeCommitment',
	args: [BigInt(player.address), hash, stake, freshPayee],
	value: parseEther('0.00015'),
	gas: CLIENT_GAS.commitGas,
});

// 4. the commit phase runs out, then the reveal (from anyone: here the browser key)
const afterCommit = (await publicClient.readContract({address: S.address, abi: S.abi, functionName: 'getCycle'})) as any;
const now = Number((await publicClient.getBlock()).timestamp);
await provider.request({method: 'evm_increaseTime', params: [Number(afterCommit.phaseEnd) - now + 1]});
await provider.request({method: 'evm_mine', params: []});
const revealUsed = await send(`reveal of ${moves.length} placements`, browserKey, {
	address: S.address,
	abi: S.abi,
	functionName: 'reveal',
	args: [BigInt(player.address), moves, SECRET, '0x000000000000000000000000000000000000000000000000', '0x0000000000000000000000000000000000000000'],
	gas: CLIENT_GAS.revealGas,
});

let failed = false;
for (const [name, used, declared] of [
	['commitGas', commitUsed, CLIENT_GAS.commitGas],
	['revealGas', revealUsed, CLIENT_GAS.revealGas],
] as const) {
	const ok = used * 110n <= declared * 100n;
	console.log(`${name}: used ${used}, declared ${declared}${ok ? '' : ' (LESS THAN 10% HEADROOM)'}`);
	failed ||= !ok;
}
if (failed) process.exit(1);
console.log('the alpha2 rehearsal on a fork of Base: done');

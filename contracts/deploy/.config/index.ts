import {
	Environment,
	ResolvedNamedAccounts,
	UnknownArtifacts,
	UnknownDeployments,
	UnresolvedUnknownNamedAccounts,
} from 'rocketh';

export function getConfig<
	Artifacts extends UnknownArtifacts = UnknownArtifacts,
	NamedAccounts extends UnresolvedUnknownNamedAccounts = UnresolvedUnknownNamedAccounts,
	ArgumentsTypes = undefined,
	Deployments extends UnknownDeployments = UnknownDeployments,
>(env: Environment<Artifacts, ResolvedNamedAccounts<NamedAccounts>, Deployments>, args?: ArgumentsTypes) {
	return {
		useTimeContract: !env.network.tags['mainnet'] && !(env.network.name === 'fast'),
	};
}

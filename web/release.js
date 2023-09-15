import {execSync} from 'child_process';

export function getReleaseID() {
	try {
		return execSync('git rev-parse HEAD').toString().trim();
	} catch {
		const timestamp = Date.now().toString();
		console.error(`could not get commit-hash to set a version id, falling back on timestamp ${timestamp}`);
		return timestamp;
	}
}

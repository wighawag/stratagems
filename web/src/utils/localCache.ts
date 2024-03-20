import {base} from '$app/paths';
import {SYNC_DB_NAME} from '$lib/config';
import {writable, type Readable, type Writable} from 'svelte/store';

class LocalCache {
	private _prefix: string;
	public upgraded: Readable<boolean>;
	constructor(private version?: string) {
		this._prefix = base.startsWith('/ipfs/') || base.startsWith('/ipns/') ? base.slice(6) : ''; // ensure local storage is not conflicting across apps on ipfs gateways (require encryption for sensitive data)

		let isUpgraded = false;
		if (this.version && typeof window !== 'undefined' && window.localStorage) {
			const lastVersion = this.getItem('_version');
			if (lastVersion && lastVersion !== this.version) {
				console.log({lastVersion, version: this.version});
				isUpgraded = true;
			} else {
				this.setItem('_version', this.version);
			}
		}

		this.upgraded = writable(isUpgraded);
	}

	acknowledgeNewVersion() {
		this.clear();
		if (this.version) {
			this.setItem('_version', this.version);
			try {
				location.reload();
			} catch {}
		}
		(this.upgraded as Writable<boolean>).set(false);
	}

	setItem(key: string, value: string): void {
		try {
			localStorage.setItem(this._prefix + key, value);
		} catch (e) {
			//
		}
	}

	getItem(key: string): string | null {
		try {
			return localStorage.getItem(this._prefix + key);
		} catch (e) {
			return null;
		}
	}

	removeItem(key: string) {
		try {
			localStorage.removeItem(this._prefix + key);
		} catch (e) {
			//
		}
	}

	clear(): void {
		try {
			localStorage.clear();
		} catch (e) {
			//
		}
	}
}

// can force version change
export default new LocalCache(SYNC_DB_NAME);

import {BaseStore} from '$utils/stores/base';
import lcache from '$utils/localCache';
import {params} from '$lib/config';

const MAX_STAGE = 2;

class SplashStore extends BaseStore<{stage: number}> {
	private stageTime: number;
	private timeout: number | undefined;
	private visited: boolean;

	constructor() {
		const result = lcache.getItem('__stratagems_visited');
		const visited = result === 'true';
		super({stage: visited ? 1 : 0});
		this.stageTime = performance.now();
		this.visited = visited;
	}

	start() {
		this.stageTime = performance.now();

		if (!params['logo']) {
			// in case image are not loaded
			setTimeout(
				() => {
					this.set({stage: MAX_STAGE});
				},
				this.visited ? 2000 : 3000,
			);
		}
	}

	stop() {
		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		this.stageTime = 1;
		this.set({stage: MAX_STAGE});
	}

	gameLogoReady() {
		this.visited ? this._loaded(1000) : this._loaded(2000);
	}

	etherplayLogoReady() {
		this._loaded(1000);
	}

	_loaded(timeIn: number) {
		const diff = performance.now() - this.stageTime;
		if (diff > timeIn) {
			if (!params['logo']) {
				this.nextStage();
			}
		} else {
			if (!params['logo']) {
				this.timeout = setTimeout(() => this.nextStage(), timeIn - diff) as unknown as number;
			}
		}
	}

	nextStage() {
		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		if (this.$store.stage < MAX_STAGE) {
			this.stageTime = performance.now();
			this.set({stage: this.$store.stage + 1});
		}

		if (this.$store.stage === MAX_STAGE) {
			// lcache.setItem('__stratagems_visited', 'true');
		}
	}
}

export const splash = new SplashStore();

if (typeof window !== 'undefined') {
	(window as any).splash = splash;
}

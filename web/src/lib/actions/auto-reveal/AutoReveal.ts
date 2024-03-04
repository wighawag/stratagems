export class AutoReveal {
	protected timeout: NodeJS.Timeout | undefined;
	start() {
		if (this.timeout) {
			clearTimeout(this.timeout);
		}
		this.timeout = setTimeout(this.check.bind(this), 1000);
	}

	stop() {
		if (this.timeout) {
			clearTimeout(this.timeout);
			this.timeout = undefined;
		}
	}

	check() {
		// TODO use that for any await ?
		// if (!this.timeout){
		//     return;
		// }
		//
		// get epoch and phase
		// if not reveal phase:
		//   return
		// if already:revealed (pending or not)
		//   return
		// if no commitment
		//   return
		// get latest commitmens for epoch
		// send tx
	}
}

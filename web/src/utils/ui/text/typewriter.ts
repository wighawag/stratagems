function setupTypewriter(t: HTMLElement, str?: string) {
	const timer: {timeout: NodeJS.Timeout | undefined} = {
		timeout: undefined,
	};
	let HTML = str || t.innerHTML;
	t.innerHTML = '';

	let cursorPosition = 0;
	let typeSpeed = 100;
	let tempTypeSpeed = 0;

	function type() {
		if (HTML[cursorPosition] === ' ') {
			tempTypeSpeed = 20;
		} else {
			tempTypeSpeed = Math.random() * typeSpeed + 50;
		}
		t.innerHTML += HTML[cursorPosition];

		cursorPosition += 1;
		if (cursorPosition < HTML.length) {
			timer.timeout = setTimeout(type, tempTypeSpeed);
		} else {
			t.classList.add('stopped');
		}
	}

	return {
		type,
		timer,
	};
}

export function typewrite(node: HTMLElement, text?: string) {
	const typewriter = setupTypewriter(node, text);
	typewriter.type();

	return {
		destroy() {
			if (typewriter.timer.timeout) {
				clearTimeout(typewriter.timer.timeout);
			}
		},
	};
}

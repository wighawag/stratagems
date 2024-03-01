export type Cancellation = (() => void) | undefined;
export type ModalOnStack = {
	element: HTMLElement;
	trigger?: Element;
	oncancel?: Cancellation;
	outroTimeout?: NodeJS.Timeout;
};

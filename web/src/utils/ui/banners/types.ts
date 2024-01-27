export type Dismiss = (() => void) | undefined;
export type BannerOnStack = {
	element: HTMLElement;
	ondismiss?: Dismiss;
};

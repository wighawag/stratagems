import tippy from 'tippy.js';
import type {Props} from 'tippy.js';
import 'tippy.js/dist/tippy.css'; // optional for styling

// initially taken from https://dev.to/danawoodman/svelte-quick-tip-using-actions-to-integrate-with-javascript-libraries-tippy-tooltips-2m94
export function tooltip<TProps extends Props = Props>(node: Element, props?: Partial<TProps> | undefined) {
	// Determine the title to show. We want to prefer
	//    the custom content passed in first, then the
	// HTML title attribute then the aria-label
	// in that order.
	const custom = props?.content;
	const title = (node as HTMLElement).title;
	const label = node.getAttribute('aria-label');
	const content = custom || title || label || undefined;

	// Let's make sure the "aria-label" attribute
	// is set so our element is accessible:
	// https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Techniques/Using_the_aria-label_attribute
	if (!label && typeof content === 'string') {
		node.setAttribute('aria-label', content);
	}

	// Clear out the HTML title attribute since
	// we don't want the default behavior of it
	// showing up on hover.
	(node as HTMLElement).title = '';

	// Support any of the Tippy props by forwarding all "params":
	// https://atomiks.github.io/tippyjs/v6/all-props/
	const tip = tippy(node, {content, ...props});

	return {
		// If the props change, let's update the Tippy instance:
		update: (newProps: Partial<TProps>) => tip.setProps({content, ...newProps}),

		// Clean up the Tippy instance on unmount:
		destroy: () => tip.destroy(),
	};
}

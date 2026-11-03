/**
 * The sandbox's node, in a Worker: a bare webevm node served over the Worker's
 * own port. See `./sandbox.ts`.
 *
 * The node is created and the port served at module scope, synchronously, so
 * the listener exists before the page's first request can arrive; the requests
 * wait on the node inside the handler rather than the module waiting before it.
 */
import {createNode} from 'webevm';
import {serveProvider} from '@eip-1193/over-port';

const node = createNode({});

serveProvider(
	{request: async (args) => (await node).request(args as never)},
	self as unknown as Parameters<typeof serveProvider>[1],
);

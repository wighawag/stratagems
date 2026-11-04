import {type Accounts, type Data, type Extensions, extensions} from './config.js';

// the artifacts, re-exported so the deploy scripts get them from one place
import * as artifacts from '../generated/artifacts/index.js';
export {artifacts};

import {setupDeployScripts} from 'rocketh';
// `execute` reports guarded setup calls to the LAN build, and only to it: see
// ./guard-recording.ts.
import {withGuardRecording} from './guard-recording.js';
const {deployScript} = setupDeployScripts<Extensions, Accounts, Data>(
	withGuardRecording(extensions),
);

export {deployScript};

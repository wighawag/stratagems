import {type Accounts, type Data, type Extensions, extensions} from './config.js';

// the artifacts, re-exported so the deploy scripts get them from one place
import * as artifacts from '../generated/artifacts/index.js';
export {artifacts};

import {setupDeployScripts} from 'rocketh';
const {deployScript} = setupDeployScripts<Extensions, Accounts, Data>(extensions);

export {deployScript};

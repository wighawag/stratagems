import {expect, describe, it} from 'vitest';
import './utils/viem-matchers';

import {parseGrid, renderGrid, toContractSimpleCell, xyToBigIntID} from 'stratagems-common';
import {loadFixture} from '@nomicfoundation/hardhat-network-helpers';

import {getGrid, withGrid} from './utils/stratagems';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test';

describe('Stratagems Scenarios', function () {
	// it.each(() => {});
	it('pass', () => {});
});

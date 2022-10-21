import {fromSingleJSONEventProcessorObject, SingleJSONEventProcessorObject} from 'ethereum-indexer-json-processor';

import {Data} from './types/data';
import {Hello} from './types/events';

const TinyRogerIndexerProcessor: SingleJSONEventProcessorObject<Data> = {
	async setup(json: Data): Promise<void> {},

	onHello(json: Data, event: Hello) {
		json.hello = event.args.value;
	},
};

export const processor = fromSingleJSONEventProcessorObject(() => TinyRogerIndexerProcessor);

import {EventWithId} from 'ethereum-indexer-json-processor';

export type Hello = EventWithId<{
	value: string;
}>;

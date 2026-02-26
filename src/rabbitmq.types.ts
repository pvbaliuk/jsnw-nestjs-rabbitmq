import {type ConnectionOptions} from 'rabbitmq-client';
import {type RabbitmqExchange, type RabbitmqQueue} from './rabbitmq';

export type RabbitmqOptions = ConnectionOptions & {
    exchanges?: RabbitmqExchange[];
    queues?: RabbitmqQueue[];
};

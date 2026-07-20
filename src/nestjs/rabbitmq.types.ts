import {type AsyncMessage, type ConnectionOptions} from 'rabbitmq-client';
import {
    type AnyRMQExchange,
    type AnyRMQQueue,
    RMQExchange,
    RMQMessageContract, RMQMessageParams,
    RMQQueue,
    RMQQueuePayloads
} from '../dsl';

export type RabbitmqForFeatureOptions = {
    exchanges?: AnyRMQExchange[];
    queues?: AnyRMQQueue[];
};

export type RabbitmqOptions = ConnectionOptions & RabbitmqForFeatureOptions;

export type RabbitmqQueueStats = {
    name: string;
    messages: number;
    consumers: number;
}

export type RabbitmqSubscribeParams<TQueue extends RMQQueue<RMQExchange<any, any>, any, any>> = {
    queue: TQueue;
    id?: string;
    requeue?: boolean;
    concurrency?: number;
    /**
     * The client can request that messages be sent in advance so that when
     * the client finishes processing a message, the following message is
     * already held locally, rather than needing to be sent down the channel.
     * Prefetching gives a performance improvement. This field specifies the
     * prefetch window size in octets. The server will send a message in
     * advance if it is equal to or smaller in size than the available prefetch
     * size (and also falls into other prefetch limits). May be set to zero,
     * meaning "no specific limit", although other prefetch limits may still
     * apply. The prefetch-size is ignored if the no-ack option is set.
     * */
    prefetchSize?: number;
    /**
     * Specifies a prefetch window in terms of whole messages. This field may
     * be used in combination with the prefetch-size field; a message will only
     * be sent in advance if both prefetch windows (and those at the channel
     * and connection level) allow it. The prefetch-count is ignored if the
     * no-ack option is set.
     * */
    prefetchCount?: number;
}

export type RabbitmqSubscriberResult = 'ack' | 'drop' | 'requeue';

export type RabbitmqSubscriberCallback<TQueue extends RMQQueue<RMQExchange<any, any>, any, any>> =
    {instance: any; methodName: string;} |
    ((payload: RMQQueuePayloads<TQueue>, message: AsyncMessage) => RabbitmqSubscriberResult | Promise<RabbitmqSubscriberResult>);

export type RabbitmqPublishParams<
    TExchange extends RMQExchange<any, Record<string, RMQMessageContract<any>>>,
    TKey extends keyof TExchange['messages']
> = RMQMessageParams<TExchange['messages'][TKey]>;

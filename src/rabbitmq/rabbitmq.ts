import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {
    Connection,
    type AsyncMessage,
    type ConnectionOptions,
    type Publisher,
} from 'rabbitmq-client';
import {Logger} from '@nestjs/common';
import type {Jsonifiable} from 'type-fest';
import {RabbitmqExchange} from './rabbitmq-exchange';
import {RabbitmqQueue} from './rabbitmq-queue';
import {RabbitmqSubscriber} from './rabbitmq-subscriber';

export type RabbitmqConstructorParams = ConnectionOptions & {};

export type RabbitmqResponse = 'ack' | 'drop' | 'requeue';

export type RabbitmqQueueStats = {
    name: string;
    messages: number;
    consumers: number;
}

export type RabbitmqMessageValidation = {
    schema: z.ZodTypeAny;
    onFail?: RabbitmqResponse;
};

export type RabbitmqSubscribeParams = {
    id?: string;
    queue: RabbitmqQueue;
    requeue?: boolean;
    concurrency?: number;
    /** The client can request that messages be sent in advance so that when
     * the client finishes processing a message, the following message is
     * already held locally, rather than needing to be sent down the channel.
     * Prefetching gives a performance improvement. This field specifies the
     * prefetch window size in octets. The server will send a message in
     * advance if it is equal to or smaller in size than the available prefetch
     * size (and also falls into other prefetch limits). May be set to zero,
     * meaning "no specific limit", although other prefetch limits may still
     * apply. The prefetch-size is ignored if the no-ack option is set. */
    prefetchSize?: number;
    /** Specifies a prefetch window in terms of whole messages. This field may
     * be used in combination with the prefetch-size field; a message will only
     * be sent in advance if both prefetch windows (and those at the channel
     * and connection level) allow it. The prefetch-count is ignored if the
     * no-ack option is set. */
    prefetchCount?: number;
    validation?: RabbitmqMessageValidation;
    autoStart?: boolean;
};

export type RabbitmqSubscriberFunction = {instance: any; methodName: string;} | ((data: any, message: AsyncMessage) => RabbitmqResponse | Promise<RabbitmqResponse>);

export type RabbitmqPublishOptions = {
    exchange: RabbitmqExchange;
    routingKey: string;
    ttlMs?: number;
    durable?: boolean;
} & ({
    type: 'raw';
    message: string|Buffer;
} | {
    type: 'json';
    message: Jsonifiable;
});

export class Rabbitmq{

    protected readonly logger: Logger;
    protected readonly connection: Connection;
    protected readonly exchanges = new Map<string, RabbitmqExchange>();
    protected readonly queues = new Map<string, RabbitmqQueue>();
    protected readonly subscribers = new Map<string, RabbitmqSubscriber>;
    protected publisher: Publisher|null = null;

    public constructor(connection: Connection);
    public constructor(options: RabbitmqConstructorParams);
    /**
     * @param {Connection | RabbitmqConstructorParams} arg
     */
    public constructor(arg: Connection|RabbitmqConstructorParams) {
        this.logger = new Logger(this.constructor.name);
        this.connection = arg instanceof Connection ? arg : new Connection(arg);
    }

    /**
     * @param {RabbitmqExchange} exchange
     * @returns {Promise<boolean>}
     */
    public async declareExchange(exchange: RabbitmqExchange): Promise<boolean>{
        if(this.exchanges.has(exchange.name))
            return false;

        this.exchanges.set(exchange.name, exchange);
        await this.connection.exchangeDeclare({
            exchange: exchange.name,
            type: exchange.type,
            durable: exchange.durable,
            autoDelete: exchange.autoDelete
        });

        return true;
    }

    /**
     * @param {RabbitmqQueue} queue
     * @returns {Promise<boolean>}
     */
    public async declareQueue(queue: RabbitmqQueue): Promise<boolean>{
        if(this.queues.has(queue.name))
            return false;

        // Auto-declare dead-letter exchange if any
        if(queue.deadLetterExchange)
            await this.declareExchange(queue.deadLetterExchange);

        this.queues.set(queue.name, queue);
        await this.connection.queueDeclare({
            queue: queue.name,
            durable: queue.durable,
            autoDelete: queue.autoDelete,
            arguments: {
                ...queue.arguments,
                'x-dead-letter-exchange': queue.deadLetterExchange?.name ?? undefined,
                'x-dead-letter-routing-key': queue.deadLetterRoutingKey ?? undefined
            },
            exclusive: queue.exclusive
        });

        // Auto-declare bound exchanges
        await this.setupQueueBindings(queue);
        return true;
    }

    /**
     * @param {RabbitmqQueue} queue
     * @returns {Promise<void>}
     * @protected
     */
    protected async setupQueueBindings(queue: RabbitmqQueue): Promise<void>{
        const bindings = queue.bindings;
        for(const binding of bindings){
            // Try to declare (or re-declare) an exchange to make sure that it exists before binding a queue to it
            await this.declareExchange(binding.exchange);

            if(binding.routingKeys.length === 0 || binding.routingKeys.length === 1){
                await this.connection.queueBind({
                    queue: queue.name,
                    exchange: binding.exchange.name,
                    routingKey: binding.routingKeys.length === 0 ? undefined : binding.routingKeys[0]
                });
            }else{
                await Promise.all(binding.routingKeys.map(routingKey => this.connection.queueBind({
                    queue: queue.name,
                    exchange: binding.exchange.name,
                    routingKey: routingKey
                })));
            }
        }
    }

    /**
     * @param {RabbitmqQueue | string} queue
     * @return {Promise<RabbitmqQueueStats | null>}
     */
    public async queueStats(queue: RabbitmqQueue|string): Promise<RabbitmqQueueStats|null>{
        try{
            const {messageCount, consumerCount} = await this.connection.queueDeclare({
                queue: typeof queue === 'string' ? queue : queue.name,
                passive: true
            });

            return {
                name: typeof queue === 'string' ? queue : queue.name,
                messages: messageCount,
                consumers: consumerCount
            };
        }catch(e){
            return null;
        }
    }

    /**
     * @param {RabbitmqQueue} queue
     * @return {Promise<number>}
     */
    public async purgeQueue(queue: RabbitmqQueue): Promise<number>{
        const {messageCount} = await this.connection.queuePurge({
            queue: queue.name
        });

        return messageCount;
    }

    /**
     * @param {RabbitmqSubscribeParams} params
     * @param {RabbitmqSubscriberFunction} subscriber
     * @return {Promise<RabbitmqSubscriber>}
     */
    public async subscribe(params: RabbitmqSubscribeParams, subscriber: RabbitmqSubscriberFunction): Promise<RabbitmqSubscriber>{
        const id = params.id ?? (
            typeof subscriber === 'function'
                ? randomUUID()
                : subscriber.instance.constructor.name + '.' + subscriber.methodName
        );

        await this.declareQueue(params.queue);
        if(this.subscribers.has(id))
            throw new Error(`Seems like a subscriber (id: ${id}) already registered`);

        const rmqSubscriber = new RabbitmqSubscriber(id, this.connection, params, subscriber);
        this.subscribers.set(id, rmqSubscriber);

        return rmqSubscriber;
    }

    /**
     * @param {string} id
     * @return {RabbitmqSubscriber | null}
     */
    public getSubscriberById(id: string): RabbitmqSubscriber|null{
        return this.subscribers.get(id) ?? null;
    }

    /**
     * @param {string} id
     * @returns {void}
     */
    public startSubscriber(id: string): void{
        const subscriber = this.subscribers.get(id);
        if(!subscriber)
            throw new Error(`Subscriber ${id} not found`);

        subscriber.start();
    }

    /**
     * @param {string} id
     * @return {Promise<void>}
     */
    public async stopSubscriber(id: string): Promise<void>{
        const subscriber = this.subscribers.get(id);
        if(!subscriber)
            throw new Error(`Subscriber ${id} not found`);

        await subscriber.stop();
    }

    /**
     * @returns {void}
     */
    public startPendingSubscribers(): void{
        for(const subscriber of this.subscribers.values())
            subscriber.start();
    }

    /**
     * @param {RabbitmqPublishOptions} options
     * @return {Promise<void>}
     */
    public async publish(options: RabbitmqPublishOptions): Promise<void>{
        if(!this.publisher)
            this.publisher = this.connection.createPublisher();

        await this.declareExchange(options.exchange);

        return this.publisher.send({
            exchange: options.exchange.name,
            routingKey: options.routingKey,
            durable: options.durable !== undefined ? options.durable : options.exchange.durable,
            /*
            As it turned out, rabbitmq-client's Envelope['contentType'] is not used anywhere,
            the library sets contentType property based on the type of message body and completely
            disregards contentType set in the Envelope

            https://github.com/cody-greene/node-rabbitmq-client/blob/af2317717e2ef169717f2371ddf2c8bf2843ed37/src/Channel.ts#L501
            */
            // contentType: options.type === 'json' ? 'application/json' : undefined,
            expiration: options.ttlMs?.toString() ?? undefined
        }, options.message);
    }

    /**
     * @return {Promise<void>}
     */
    public async close(): Promise<void>{
        const promises: Promise<void>[] = [];
        for(const subscriber of this.subscribers.values())
            promises.push(subscriber.stop());

        if(this.publisher)
            promises.push(this.publisher.close());

        promises.push(this.connection.close());
        await Promise.allSettled(promises);
    }

}

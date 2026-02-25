import {z} from 'zod';
import {type AsyncMessage, Connection, type Consumer, ConsumerStatus, Publisher} from 'rabbitmq-client';
import {RabbitmqExchange} from './rabbitmq-exchange';
import {RabbitmqQueue} from './rabbitmq-queue';
import {Logger} from '@nestjs/common';
import {Jsonifiable} from 'type-fest';
import {RabbitmqSubscriber} from './rabbitmq-subscriber';

export type RabbitmqConstructorParams = {
    name: string;
    /**
     * The name that will be displayed in RabbitMQ management UI. By default - the same as the name
     */
    connectionName?: string;
    hostname: string;
    port: number;
    username: string;
    password: string;
    vhost?: string;
    connectionTimeout?: number;
};

export type RabbitmqResponse = 'ack' | 'drop' | 'requeue';

export type RabbitmqQueueStats = {
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
    prefetchSize?: number;
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

    public readonly name: string;
    protected readonly logger: Logger;
    protected readonly connection: Connection;
    protected readonly exchanges = new Map<string, RabbitmqExchange>();
    protected readonly queues = new Map<string, RabbitmqQueue>();
    protected readonly subscribers = new Map<string, RabbitmqSubscriber>;
    protected publisher: Publisher|null = null;

    public constructor(name: string, connection: Connection);
    public constructor(params: RabbitmqConstructorParams);
    /**
     * @param {string | RabbitmqConstructorParams} arg1
     * @param {Connection} arg2
     */
    public constructor(arg1: string|RabbitmqConstructorParams, arg2?: Connection) {
        if(typeof arg1 === 'string' && !arg2)
            throw new TypeError(`Invalid second argument passed to the constructor of ${Rabbitmq.name}`);

        this.name = typeof arg1 === 'string' ? arg1 : arg1.name;
        this.logger = new Logger(Rabbitmq.name + `(${this.name})`);
        this.connection = typeof arg1 === 'string'
            ? arg2!
            : new Connection({
                connectionName: arg1.connectionName ?? arg1.name,
                hostname: arg1.hostname,
                port: arg1.port,
                username: arg1.username,
                password: arg1.password,
                vhost: arg1.vhost ?? '/',
                connectionTimeout: arg1.connectionTimeout ?? 10_000
            });
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

            return {messages: messageCount, consumers: consumerCount};
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
                ? Math.random().toString()
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
            throw new Error(`Subscriber ${id} not found for connection ${this.name}`);

        subscriber.start();
    }

    /**
     * @param {string} id
     * @return {Promise<void>}
     */
    public async stopSubscriber(id: string): Promise<void>{
        const subscriber = this.subscribers.get(id);
        if(!subscriber)
            throw new Error(`Subscriber ${id} not found for connection ${this.name}`);

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
    public publish(options: RabbitmqPublishOptions): Promise<void>{
        if(!this.publisher)
            this.publisher = this.connection.createPublisher();

        return this.publisher.send({
            exchange: options.exchange.name,
            routingKey: options.routingKey,
            durable: options.durable !== undefined ? options.durable : options.exchange.durable,
            contentType: options.type === 'json' ? 'application/json' : undefined,
            expiration: options.ttlMs?.toString() ?? undefined
        }, options.type === 'json' ? JSON.stringify(options.message) : options.message);
    }

    /**
     * @return {Promise<void>}
     */
    public async close(): Promise<void>{
        const promises: Promise<void>[] = [];
        for(const subscriber of this.subscribers.values())
            promises.push(subscriber.stop());

        promises.push(this.connection.close());
        await Promise.allSettled(promises);
    }

}

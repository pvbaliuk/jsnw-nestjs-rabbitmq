import {z} from 'zod';
import {type AsyncMessage, Connection, type Consumer, ConsumerStatus, Publisher} from 'rabbitmq-client';
import {RabbitmqExchange} from './rabbitmq-exchange';
import {RabbitmqQueue} from './rabbitmq-queue';
import {Logger} from '@nestjs/common';
import {Jsonifiable} from 'type-fest';

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

export type RabbitmqMessageValidation = {
    schema: z.ZodTypeAny;
    onFail?: RabbitmqResponse;
};

export type RabbitmqSubscribeParams = {
    queue: RabbitmqQueue;
    requeue?: boolean;
    concurrency?: number;
    prefetchSize?: number;
    prefetchCount?: number;
    validation?: RabbitmqMessageValidation;
} & ({
    id: string;
    autoStart: boolean;
} | {
    id?: never;
    autoStart?: never;
});

export type RabbitmqSubscriber = {instance: any; methodName: string;} | ((data: any, message: AsyncMessage) => RabbitmqResponse | Promise<RabbitmqResponse>);

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
    protected readonly consumers = new Set<Consumer>;
    protected readonly consumersById = new Map<string, {isStarted: boolean; consumer: Consumer;}>();
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
     * @param {RabbitmqSubscribeParams} params
     * @param {RabbitmqSubscriber} subscriber
     * @returns {Promise<void>}
     */
    public async subscribe(params: RabbitmqSubscribeParams, subscriber: RabbitmqSubscriber): Promise<void>{
        await this.declareQueue(params.queue);

        const consumer = this.connection.createConsumer({
            queue: params.queue.name,
            requeue: !!params.requeue,
            qos: {
                prefetchSize: params.prefetchSize ?? 0,
                prefetchCount: params.prefetchCount ?? 1
            },
            concurrency: params.concurrency ?? 1,
            lazy: !!params.autoStart
        }, this.internalConsumer.bind(this, params, subscriber));

        this.consumers.add(consumer);
        if(params.id)
            this.consumersById.set(params.id, {isStarted: !!params.autoStart, consumer: consumer});
    }

    /**
     * @param {string} id
     * @returns {void}
     */
    public startSubscriber(id: string): void{
        const consumer = this.consumersById.get(id);
        if(!consumer)
            throw new Error(`Subscriber ${id} not found for connection ${this.name}`);

        if(consumer.isStarted)
            return;

        consumer.isStarted = true;
        consumer.consumer.start();
    }

    /**
     * @returns {void}
     */
    public startPendingSubscribers(): void{
        for(const consumer of this.consumersById.values()){
            if(consumer.isStarted)
                continue;

            consumer.isStarted = true;
            consumer.consumer.start();
        }
    }

    /**
     * @param {RabbitmqSubscribeParams} params
     * @param {RabbitmqSubscriber} subscriber
     * @param {AsyncMessage} message
     * @returns {Promise<ConsumerStatus>}
     * @private
     */
    private async internalConsumer(params: RabbitmqSubscribeParams, subscriber: RabbitmqSubscriber, message: AsyncMessage): Promise<ConsumerStatus>{
        if(!message.body || (typeof message.body !== 'string' && !Buffer.isBuffer(message.body)))
            return ConsumerStatus.DROP;

        const messageBody = Buffer.isBuffer(message.body)
            ? message.body.toString('utf-8')
            : typeof message.body === 'string'
                ? message.body
                : null;

        if(!messageBody)
            return ConsumerStatus.DROP;

        const isJSON = message.contentType === 'application/json';
        let data: any;

        try{
            data = isJSON ? JSON.parse(messageBody) : messageBody;
        }catch(e){
            this.logger.error(`Failed to parse message body as JSON`);
            return ConsumerStatus.DROP;
        }

        if(!!params.validation?.schema){
            const {data: parsed, error, success} = params.validation.schema.safeParse(data);
            if(error || !success)
                return this.mapRabbitmqResponseToConsumerStatus(params.validation.onFail ?? 'drop');

            data = parsed;
        }

        const subscriberName = typeof subscriber === 'function'
            ? subscriber.name ?? 'anonymous function'
            : `${subscriber.instance.constructor.name}.${subscriber.methodName}`;

        try{
            const response = await (typeof subscriber === 'function'
                ? subscriber(data, message)
                : subscriber.instance[subscriber.methodName](data, message)
            );

            return this.mapRabbitmqResponseToConsumerStatus(response);
        }catch(e){
            this.logger.error(`Error in subscriber ${subscriberName} (connection: ${this.name}). Error: ${e.constructor.name}(${e.message ?? ''})`);
            return !!params.requeue ? ConsumerStatus.REQUEUE : ConsumerStatus.DROP;
        }
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
     * @param {RabbitmqResponse | string} response
     * @return {ConsumerStatus}
     * @protected
     */
    protected mapRabbitmqResponseToConsumerStatus(response: RabbitmqResponse|string): ConsumerStatus{
        response = response.toLowerCase() as RabbitmqResponse | string;
        switch(response){
            case 'ack': return ConsumerStatus.ACK;
            case 'requeue': return ConsumerStatus.REQUEUE;
            case 'drop': return ConsumerStatus.DROP;
        }

        return ConsumerStatus.DROP;
    }

    /**
     * @return {Promise<void>}
     */
    public async close(): Promise<void>{
        const promises: Promise<void>[] = [];
        for(const consumer of this.consumers.values())
            promises.push(consumer.close());

        promises.push(this.connection.close());
        await Promise.allSettled(promises);
    }

}

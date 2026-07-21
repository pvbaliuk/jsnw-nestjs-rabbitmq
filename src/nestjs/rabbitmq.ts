import {randomUUID} from 'node:crypto';
import {Connection, Publisher} from 'rabbitmq-client';
import {Inject, Injectable, type OnModuleInit, type OnModuleDestroy} from '@nestjs/common';
import {createInFlightDeduper} from '../shared';
import {type AnyRMQExchange, type AnyRMQQueue, type RMQMessageContract, RMQExchange} from '../dsl';
import {RABBITMQ_OPTIONS_TOKEN} from './rabbitmq.consts';
import type {
    RabbitmqOptions, RabbitmqPublishOptions, RabbitmqPublishParams,
    RabbitmqQueueStats,
    RabbitmqSubscribeParams, RabbitmqSubscriberCallback
} from './rabbitmq.types';
import {RabbitmqSubscriber} from './rabbitmq-subscriber';
import {RabbitmqStorage} from './rabbitmq-storage';
import {chunk} from '../shared/utils';

@Injectable()
export class Rabbitmq implements OnModuleInit, OnModuleDestroy{

    private readonly deduper = createInFlightDeduper();

    protected readonly mq: Connection;
    protected readonly exchanges = new Map<string, AnyRMQExchange>();
    protected readonly queues = new Map<string, AnyRMQQueue>();
    protected readonly subscribers = new Map<string, RabbitmqSubscriber>;
    protected publisher: Publisher|null = null;

    /**
     * @param {RabbitmqOptions} options
     */
    public constructor(
        @Inject(RABBITMQ_OPTIONS_TOKEN)
        private readonly options: RabbitmqOptions
    ) {
        this.mq = new Connection(options);

        if(options.exchanges && options.exchanges.length > 0)
            RabbitmqStorage.addExchanges(options.exchanges);

        if(options.queues && options.queues.length > 0)
            RabbitmqStorage.addQueues(options.queues);
    }

    /**
     * @return {Promise<void>}
     */
    public async onModuleInit(): Promise<void>{
        const exchanges = RabbitmqStorage.getExchanges(),
            queues = RabbitmqStorage.getQueues();

        if(exchanges.length > 0)
            await Promise.all(exchanges.map(exchange => this.declareExchange(exchange)));

        if(queues.length > 0)
            await Promise.all(queues.map(queue => this.declareQueue(queue)));
    }

    /**
     * @return {Promise<void>}
     */
    public async onModuleDestroy(): Promise<void>{
        await this.close();
    }

    /**
     * @param {AnyRMQExchange} exchange
     * @return {Promise<void>}
     */
    public declareExchange(exchange: AnyRMQExchange): Promise<void>{
        return this.deduper.use(`exchange:${exchange.name}`, async () => {
            if(this.exchanges.has(exchange.name))
                return;

            this.exchanges.set(exchange.name, exchange);
            try{
                await this.mq.exchangeDeclare({
                    exchange: exchange.name,
                    type: exchange.type,
                    durable: exchange.options.durable,
                    autoDelete: exchange.options.autoDelete
                });
            }catch(e){
                this.exchanges.delete(exchange.name);
                throw e;
            }
        });
    }

    /**
     * @param {AnyRMQQueue} queue
     * @param {boolean} [noAutoBinding=false]
     * @return {Promise<void>}
     */
    public async declareQueue(queue: AnyRMQQueue, noAutoBinding: boolean = false): Promise<void>{
        return this.deduper.use(`queue:${queue.resolvedName}`, async () => {
            if(this.queues.has(queue.resolvedName))
                return;

            await this.declareExchange(queue.exchange)

            this.queues.set(queue.resolvedName, queue);
            try{
                await this.mq.queueDeclare({
                    queue: queue.resolvedName,
                    durable: queue.options.durable,
                    autoDelete: queue.options.autoDelete,
                    exclusive: queue.options.exclusive
                });

                if(!noAutoBinding)
                    await this.setupQueueBindings(queue);
            }catch(e){
                this.queues.delete(queue.resolvedName);
                throw e;
            }
        });
    }

    /**
     * @param {AnyRMQQueue} queue
     * @param {string} routingKey
     * @return {Promise<void>}
     */
    public bindQueue(queue: AnyRMQQueue, routingKey: string): Promise<void>{
        return this.mq.queueBind({
            queue: queue.resolvedName,
            exchange: queue.exchange.name,
            routingKey: routingKey
        });
    }

    /**
     * @param {AnyRMQQueue} queue
     * @param {string} routingKey
     * @return {Promise<void>}
     */
    public unbindQueue(queue: AnyRMQQueue, routingKey: string): Promise<void>{
        return this.mq.queueUnbind({
            queue: queue.resolvedName,
            exchange: queue.exchange.name,
            routingKey: routingKey
        });
    }

    /**
     * @param {AnyRMQQueue} queue
     * @return {Promise<void>}
     * @private
     */
    private async setupQueueBindings(queue: AnyRMQQueue): Promise<void>{
        return this.deduper.use(`queue:${queue.resolvedName}:bindings`, async () => {
            const routingKeys = queue.resolvedRoutingKeys;
            if(routingKeys.length === 0)
                return;

            const chunks = chunk(routingKeys, 20);
            for(const chunk of chunks)
                await Promise.all(chunk.map(k => this.bindQueue(queue, k)));
        });
    }

    /**
     * @param {AnyRMQQueue} queue
     * @return {Promise<RabbitmqQueueStats | null>}
     */
    public async queueStats(queue: AnyRMQQueue): Promise<RabbitmqQueueStats|null>{
        try{
            const {messageCount, consumerCount} = await this.mq.queueDeclare({
                queue: queue.resolvedName,
                passive: true
            });

            return {
                name: queue.name,
                messages: messageCount,
                consumers: consumerCount
            };
        }catch(e){
            return null;
        }
    }

    /**
     * @param {AnyRMQQueue} queue
     * @return {Promise<number>}
     */
    public async purgeQueue(queue: AnyRMQQueue): Promise<number>{
        const {messageCount} = await this.mq.queuePurge({
            queue: queue.resolvedName
        });

        return messageCount;
    }

    /**
     * @template {RabbitmqSubscribeParams<any>} TParams
     * @param {TParams} params
     * @param {RabbitmqSubscriberCallback<TParams["queue"]>} subscriber
     * @return {Promise<RabbitmqSubscriber>}
     */
    public async subscribe<TParams extends RabbitmqSubscribeParams<any>>(params: TParams, subscriber: RabbitmqSubscriberCallback<TParams['queue']>){
        const id = params.id ?? (
            typeof subscriber === 'function'
                ? randomUUID()
                : subscriber.instance.constructor.name + '.' + subscriber.methodName
        );

        await this.declareQueue(params.queue, !!params.noAutoBinding);
        if(this.subscribers.has(id))
            throw new Error(`Seems like a subscriber (id: ${id}) is already registered`);

        const mqSubscriber = new RabbitmqSubscriber(id, this.mq, params, subscriber as any);
        this.subscribers.set(id, mqSubscriber);

        return mqSubscriber;
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
     * @template {RMQExchange<any, any>} TExchange
     * @template {string} TKey
     * @param {TExchange} exchange
     * @param {TKey} key
     * @param {RabbitmqPublishParams<TExchange, TKey>} params
     * @param {RabbitmqPublishOptions} [options]
     * @return {Promise<void>}
     */
    public async publish<
        TExchange extends RMQExchange<any, any>,
        TKey extends keyof TExchange['messages']
    >(exchange: TExchange, key: TKey, params: RabbitmqPublishParams<TExchange, TKey>, options?: RabbitmqPublishOptions): Promise<void>{
        if(!this.publisher)
            this.publisher = this.mq.createPublisher();

        const msg = exchange['messages'][key] as RMQMessageContract<any>;
        const payload = msg.payload ? msg.payload.parse(params['payload']) : params['payload'];
        let routingKey: string = msg['routingKey'];
        if(params['params']){
            for(const [k, v] of Object.entries(params['params']))
                routingKey = routingKey.replaceAll(`{${k}}`, v.toString());
        }

        await this.declareExchange(exchange);
        return this.publisher.send({
            exchange: exchange.name,
            routingKey: routingKey,
            durable: options?.durable ?? exchange.options.durable,
            /*
            As it turned out, rabbitmq-client's Envelope['contentType'] is not used anywhere,
            the library sets contentType property based on the type of message body and completely
            disregards contentType set in the Envelope

            https://github.com/cody-greene/node-rabbitmq-client/blob/af2317717e2ef169717f2371ddf2c8bf2843ed37/src/Channel.ts#L501
            */
            // contentType: options.type === 'json' ? 'application/json' : undefined,
            expiration: options?.ttlMs !== undefined ? options.ttlMs.toString() : undefined
        }, msg.payload ? JSON.stringify(payload) : payload);
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

        promises.push(this.mq.close());
        await Promise.allSettled(promises);
    }

}

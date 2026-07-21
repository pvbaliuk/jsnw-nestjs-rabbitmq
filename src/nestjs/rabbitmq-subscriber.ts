import {z, ZodError} from 'zod';
import {type AsyncMessage, Connection, Consumer, ConsumerStatus} from 'rabbitmq-client';
import {type AnyRMQQueue} from '../dsl';
import type {RabbitmqSubscribeParams, RabbitmqSubscriberCallback, RabbitmqSubscriberResult} from './rabbitmq.types';

export class RabbitmqSubscriber{

    private readonly consumer: Consumer;
    private _isActive: boolean;

    /**
     * @return {string}
     */
    public get consumerTag(): string{
        return this.consumer.consumerTag;
    }

    /**
     * @return {Consumer["stats"]}
     */
    public get stats(): Consumer['stats']{
        return this.consumer.stats;
    }

    /**
     * @return {boolean}
     */
    public get isActive(): boolean{
        return this._isActive;
    }

    public constructor(
        public readonly id: string,
        private readonly mq: Connection,
        private readonly params: RabbitmqSubscribeParams<AnyRMQQueue>,
        private readonly subscriber: RabbitmqSubscriberCallback<AnyRMQQueue>
    ) {
        const queueName = params.queue.exchange.name + '.' + params.queue.name;
        this._isActive = false;
        this.consumer = this.mq.createConsumer({
            queue: queueName,
            queueOptions: {
                queue: queueName,
                durable: params.queue.options.durable,
                autoDelete: params.queue.options.autoDelete,
                arguments: {
                    'x-message-ttl': params.queue.options.xMessageTtlMs
                },
                exclusive: params.queue.options.exclusive
            },
            requeue: !!params.requeue,
            qos: {
                prefetchSize: params.prefetchSize ?? 0,
                prefetchCount: params.prefetchCount ?? 1
            },
            concurrency: params.concurrency ?? 1,
            lazy: false
        }, this.onMessage);
    }

    /**
     */
    public start(): void{
        if(this._isActive)
            return;

        this._isActive = true;
        this.consumer.start();
    }

    /**
     * @return {Promise<void>}
     */
    public stop(): Promise<void>{
        if(!this._isActive)
            return Promise.resolve();

        this._isActive = false;
        return this.consumer.close();
    }

    /**
     * @param {AsyncMessage} message
     * @return {Promise<ConsumerStatus>}
     */
    protected onMessage = async (message: AsyncMessage): Promise<ConsumerStatus> => {
        if(!this.isValidMessageBody(message))
            return ConsumerStatus.DROP;

        let payload: string|object|null = null;
        try{
            payload = this.getMessageBody(message);
        }catch(e){
            if(e instanceof Error && e.name === 'SyntaxError'){
                // TODO: Log error?
            }

            return ConsumerStatus.DROP;
        }

        const [routingKey, schema] = this.getPayloadSchemaForMessage(this.params.queue, message);
        if(!routingKey)
            return ConsumerStatus.DROP;

        let data: any = payload;
        if(schema){
            const {data: parsed, error, success} = schema.safeParse(payload);
            if(!success)
                return ConsumerStatus.DROP;

            data = parsed;
        }

        try{
            const result = await (typeof this.subscriber === 'function'
                ? this.subscriber({key: routingKey, data}, message)
                : this.subscriber.instance[this.subscriber.methodName]({key: routingKey, data}, message)
            );

            return this.mapRabbitmqResponseToConsumerStatus(result);
        }catch(e){
            if(e instanceof ZodError)
                return ConsumerStatus.DROP;

            return !!this.params.requeue
                ? ConsumerStatus.REQUEUE
                : ConsumerStatus.DROP;
        }
    }

    /**
     * @param {AsyncMessage} message
     * @return {boolean}
     * @protected
     */
    protected isValidMessageBody(message: AsyncMessage): boolean{
        return (message.body && (
            typeof message.body === 'string'
            || (typeof message.body === 'object'
            && !Buffer.isBuffer(message.body))));
    }

    /**
     * @param {AsyncMessage} message
     * @return {string | object | null}
     * @protected
     */
    protected getMessageBody(message: AsyncMessage): string|object|null{
        if(!this.isValidMessageBody(message))
            return null;

        // rabbitmq-client doesn't correctly set content-type of a message, so we assume that any message has an application/json type
        // https://github.com/cody-greene/node-rabbitmq-client/blob/2729343807acedde3ac0b80adc2fc5c5b5d3f2a0/src/Channel.ts#L501
        if(Buffer.isBuffer(message.body) || typeof message.body === 'string'){
            const jsonString = Buffer.isBuffer(message.body)
                ? message.body.toString('utf-8')
                : message.body;

            return JSON.parse(jsonString);
        }

        return message.body;
    }

    /**
     * @param {AnyRMQQueue} queue
     * @param {AsyncMessage} message
     * @return {[string, z.ZodSchema | null]|[null, null]}
     * @protected
     */
    protected getPayloadSchemaForMessage(queue: AnyRMQQueue, message: AsyncMessage): [string, z.ZodSchema|null] | [null, null]{
        for(const rk of queue.bindings){
            const msgContract = queue.exchange.messages[rk];
            const rkRegExp = new RegExp(
                '^'
                + msgContract.routingKey
                    .replaceAll('.', '\\.')
                    .replaceAll(
                        /\{([A-Za-z\d_\-]+)\}/iug,
                        '(?<$1>[A-Za-z\\d_\\-]+)'
                    )
                + '$',
                'iu'
            );

            if(rkRegExp.test(message.routingKey))
                return [msgContract.routingKey, msgContract.payload ?? null];
        }

        return [null, null];
    }

    /**
     * @param {RabbitmqSubscriberResult | string} result
     * @return {ConsumerStatus}
     * @private
     */
    private mapRabbitmqResponseToConsumerStatus(result: RabbitmqSubscriberResult|string): ConsumerStatus{
        result = result.toLowerCase() as RabbitmqSubscriberResult | string;
        switch(result){
            case 'ack': return ConsumerStatus.ACK;
            case 'requeue': return ConsumerStatus.REQUEUE;
            case 'drop': return ConsumerStatus.DROP;
        }

        return ConsumerStatus.DROP;
    }

}

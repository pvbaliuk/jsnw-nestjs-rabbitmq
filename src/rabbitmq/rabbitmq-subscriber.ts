import {z, ZodError} from 'zod';
import {type AsyncMessage, Connection, Consumer, ConsumerStatus} from 'rabbitmq-client';
import {Logger} from '@nestjs/common';
import type {RabbitmqSubscribeParams, RabbitmqSubscriberFunction} from './rabbitmq';
import {mapRabbitmqResponseToConsumerStatus} from './rabbitmq.helpers';

export class RabbitmqSubscriber{

    private readonly logger: Logger;
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

    /**
     * @param {string} id
     * @param {Connection} connection
     * @param {RabbitmqSubscribeParams} params
     * @param {RabbitmqSubscriberFunction} subscriber
     */
    public constructor(
        public readonly id: string,
        private readonly connection: Connection,
        private readonly params: RabbitmqSubscribeParams,
        private readonly subscriber: RabbitmqSubscriberFunction
    ) {
        this.logger = new Logger(`${this.constructor.name}(id=${id})`);
        this._isActive = !params.autoStart;
        this.consumer = this.connection.createConsumer({
            queue: params.queue.name,
            queueOptions: {
                queue: params.queue.name,
                durable: params.queue.durable,
                autoDelete: params.queue.autoDelete,
                arguments: {
                    ...params.queue.arguments,
                    'x-dead-letter-exchange': params.queue.deadLetterExchange?.name ?? undefined,
                    'x-dead-letter-routing-key': params.queue.deadLetterRoutingKey ?? undefined
                }
            },
            requeue: !!params.requeue,
            qos: {
                prefetchSize: params.prefetchSize ?? 0,
                prefetchCount: params.prefetchCount ?? 1
            },
            concurrency: params.concurrency ?? 1,
            lazy: !!params.autoStart
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
     * @private
     */
    protected onMessage = async (message: AsyncMessage): Promise<ConsumerStatus> => {
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

        if(!!this.params.validation?.schema){
            const {data: parsed, error, success} = this.params.validation.schema.safeParse(data);
            if(error || !success)
                return mapRabbitmqResponseToConsumerStatus(this.params.validation.onFail ?? 'drop');

            data = parsed;
        }

        try{
            const response = await (typeof this.subscriber === 'function'
                    ? this.subscriber(data, message)
                    : this.subscriber.instance[this.subscriber.methodName](data, message)
            );

            return mapRabbitmqResponseToConsumerStatus(response);
        }catch(e){
            if(e instanceof ZodError){
                this.logger.error(`Encountered ZodError:\n${z.prettifyError(e)}`);
                return ConsumerStatus.DROP;
            }

            this.logger.error(`Error: ${e.constructor.name}(${e.message ?? ''})`);
            return !!this.params.requeue ? ConsumerStatus.REQUEUE : ConsumerStatus.DROP;
        }
    }

}

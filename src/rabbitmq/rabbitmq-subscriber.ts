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
        if(!message.body || (typeof message.body !== 'string' && typeof message.body !== 'object' && !Buffer.isBuffer(message.body)))
            return ConsumerStatus.DROP;

        let payload: string|object|null = null;
        try{
            payload = this.getMessageBody(message);
        }catch(e){
            if(e instanceof Error && e.name === 'SyntaxError')
                this.logger.error('Failed to parse message body as JSON');

            return ConsumerStatus.DROP;
        }

        if(!!this.params.validation?.schema){
            const {data: parsed, error, success} = this.params.validation.schema.safeParse(payload);
            if(error || !success){
                this.logger.error(`Failed to validate message. Error:\n${z.prettifyError(error)}`);
                return mapRabbitmqResponseToConsumerStatus(this.params.validation.onFail ?? 'drop');
            }

            payload = parsed as any;
        }

        try{
            const response = await (typeof this.subscriber === 'function'
                    ? this.subscriber(payload, message)
                    : this.subscriber.instance[this.subscriber.methodName](payload, message)
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

    /**
     * @param {AsyncMessage} message
     * @return {string | object | null}
     * @private
     */
    private getMessageBody(message: AsyncMessage): string|object|null{
        if(!message.body || (
            typeof message.body !== 'string'
            && typeof message.body !== 'object'
            && !Buffer.isBuffer(message.body))
        ) return null;

        if(message.contentType === 'application/json'){
            if(Buffer.isBuffer(message.body) || typeof message.body === 'string'){
                const jsonString = Buffer.isBuffer(message.body)
                    ? message.body.toString('utf-8')
                    : message.body;

                return JSON.parse(jsonString);
            }

            return message.body;
        }else{
            if(Buffer.isBuffer(message.body))
                return message.body.toString('utf-8');

            return message.body;
        }
    }

}

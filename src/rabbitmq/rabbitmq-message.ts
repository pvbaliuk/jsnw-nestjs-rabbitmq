import {z} from 'zod';
import {type RabbitmqPublishOptions} from './rabbitmq';
import {RabbitmqExchange} from './rabbitmq-exchange';
import {Jsonifiable} from 'type-fest';

export type RabbitmqMessageType = 'raw' | 'json';

export type RabbitmqMessageTemplate = {
    type: RabbitmqMessageType;
    exchange: RabbitmqExchange;
    durable: boolean;
    routingKey: string;
    schema?: z.ZodTypeAny;
    ttlMs?: number;
};

type InputData<T extends RabbitmqMessageTemplate> = T extends {schema: z.ZodTypeAny}
    ? z.input<T['schema']>
    : T['type'] extends 'json'
        ? Jsonifiable
        : any;

export class RabbitmqMessage<T extends RabbitmqMessageTemplate>{

    private readonly _template: T;

    /**
     * @return {T["schema"]}
     */
    public get schema(): T['schema']{
        return this._template.schema;
    }

    /**
     * @param {T} template
     * @return {RabbitmqMessageTemplate<T>}
     */
    public static template<T extends RabbitmqMessageTemplate>(template: T): RabbitmqMessage<T>{
        return new RabbitmqMessage<T>(template);
    }

    /**
     * @template {RabbitmqMessageTemplate} T
     * @param {T} template
     * @protected
     */
    protected constructor(template: T) {
        this._template = template;
    }

    /**
     * @param {InputData<T>} data
     * @return {RabbitmqPublishOptions}
     */
    public make(data: InputData<T>): RabbitmqPublishOptions{
       const payload = this._template.schema
           ? this._template.schema.parse(data)
           : data;

       return {
           type: this._template.type,
           exchange: this._template.exchange,
           durable: this._template.durable,
           routingKey: this._template.routingKey,
           ttlMs: this._template.ttlMs,
           message: payload as any
       };
    }

}

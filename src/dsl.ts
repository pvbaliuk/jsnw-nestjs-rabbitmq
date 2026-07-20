import {z} from 'zod';
import {Prettify, Without} from './shared';

//region Messages

type ExtractParam<S extends string, N extends Record<string, string>> = S extends `{${infer Param}}`
    ? Record<Param, string> & N
    : N;

type ExtractParams<S extends string> = S extends `${infer Segment}.${infer Rest}`
    ? ExtractParam<Segment, ExtractParams<Rest>>
    : ExtractParam<S, {}>;

export type RMQMessageContract<T extends string> = {
    routingKey: T;
    payload?: z.ZodSchema;
    durable?: boolean;
    ttlMs?: number;
}

export type RMQMessagePayload<T extends RMQMessageContract<any>> = Without<{
    key: T['routingKey'];
    data: T['payload'] extends z.ZodSchema ? z.output<T['payload']> : never;
}, never>;

export type RMQMessageParams<T extends RMQMessageContract<any>> = Without<{
    payload: T['payload'] extends z.ZodSchema ? z.input<T['payload']> : never;
    params: keyof ExtractParams<T['routingKey']> extends never ? never : ExtractParams<T['routingKey']>;
}, never>;

//endregion

//region Exchange

export type RMQExchangeType = 'fanout' | 'direct' | 'topic';

export type RMQExchangeOptions = {
    durable: boolean;
    autoDelete: boolean;
}

export type RMQExchangeContract<TName extends string> = {
    name: TName;
    type: RMQExchangeType;
}

/**
 * @template {RMQExchangeContract<any>} TContract
 * @template {Record<string, RMQMessageContract<string>>} TMessages
 */
export class RMQExchange<
    TContract extends RMQExchangeContract<string>,
    TMessages extends Record<string, RMQMessageContract<string>>
>{

    public readonly name: TContract['name'];
    public readonly type: TContract['type'];

    public readonly messages: TMessages;
    public readonly options: RMQExchangeOptions;

    /**
     * @param {TContract} contract
     * @param {TMessages} messages
     * @param {Partial<RMQExchangeOptions>} options
     */
    public constructor(contract: TContract, messages: TMessages, options?: Partial<RMQExchangeOptions>) {
        this.name = contract.name;
        this.type = contract.type;

        this.messages = Object.freeze(messages);
        this.options = Object.freeze({
            durable: !!options?.durable,
            autoDelete: !!options?.autoDelete
        });
    }

    public createQueue<
        const TName extends string,
        TBindings extends (keyof this['messages'])[]
    >(
        name: TName,
        bindings: TBindings,
        options?: RMQQueueOptions
    ): RMQQueue<this, TName, TBindings>{
        return new RMQQueue<this, TName, TBindings>(name, this, bindings, options);
    }

}

export const createExchange = <
    const T extends RMQExchangeContract<string>,
    const M extends Record<string, RMQMessageContract<string>>
>(
    contract: T,
    messages: M,
    options?: Partial<RMQExchangeOptions>
): RMQExchange<T, M> => {
    return new RMQExchange<T, M>(contract, messages, options);
}

//endregion

//region Queue

export type RMQQueueOptions = {
    durable: boolean;
    autoDelete: boolean;
    exclusive?: boolean;
    xMessageTtlMs?: number;
}

export type RMQQueuePayloads<T extends RMQQueue<RMQExchange<any, any>, any, any>> = Prettify<{
    [K in T['bindings'][number]]: RMQMessagePayload<T['exchange']['messages'][K]>;
}[T['bindings'][number]]>;

export class RMQQueue<
    TExchange extends RMQExchange<any, any>,
    TName extends string,
    TBindings extends (keyof TExchange['messages'])[]
>{

    public readonly name: TName;
    public readonly exchange: TExchange;
    public readonly bindings: TBindings;
    public readonly options: RMQQueueOptions;

    public constructor(
        name: TName,
        exchange: TExchange,
        bindings: TBindings,
        options?: Partial<RMQQueueOptions>
    ) {
        this.name = name;
        this.exchange = exchange;
        this.bindings = bindings;
        this.options = Object.freeze({
            durable: !!options?.durable,
            autoDelete: !!options?.autoDelete,
            exclusive: options?.exclusive === undefined ? false : options.exclusive,
            xMessageTtlMs: options?.xMessageTtlMs ?? undefined
        });
    }

    /**
     * @return {string[]}
     */
    public getAMQPBindings(): string[]{
        return this.bindings.map((key: string) => {
            return (this.exchange.messages[key]['routingKey'] as string)
                .replaceAll(/\{[A-Za-z0-9_\-]+\}/iug, '*');
        }).filter(Boolean);
    }

}

//endregion

//region Helper types

export type AnyRMQExchange = RMQExchange<RMQExchangeContract<string>, Record<string, RMQMessageContract<string>>>;
export type AnyRMQQueue = RMQQueue<AnyRMQExchange, string, string[]>;

//endregion

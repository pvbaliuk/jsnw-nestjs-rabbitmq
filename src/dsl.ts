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
}

export type RMQMessagePayload<T extends RMQMessageContract<any>> = Without<{
    key: T['routingKey'];
    data: T['payload'] extends z.ZodSchema ? z.output<T['payload']> : never;
}, never>;

export type RMQMessageRoutingParams<T extends RMQMessageContract<any>> = ExtractParams<T['routingKey']>;

export type RMQMessageParams<T extends RMQMessageContract<any>> = Without<{
    payload: T['payload'] extends z.ZodSchema ? z.input<T['payload']> : never;
    params: keyof RMQMessageRoutingParams<T> extends never ? never : RMQMessageRoutingParams<T>;
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

export type RMQBindingParams<
    TExchange extends RMQExchange<any, Record<string, RMQMessageContract<any>>>,
    TQueue extends RMQQueue<TExchange, any, (keyof TExchange['messages'])[]>
> = Prettify<Without<{
    [K in TQueue['bindings'][number]]?: keyof RMQMessageRoutingParams<TExchange['messages'][K]> extends never
        ? never
        : Array<Partial<RMQMessageRoutingParams<TExchange['messages'][K]>>>;
}, never>>;

export type AnyRMQBindingParams = Record<string, Array<any>>;

/**
 * @template {RMQExchange<any, any>} TExchange
 * @template {string} TName
 * @template {(keyof TExchange['messages'])[]} TBindings
 */
export class RMQQueue<
    TExchange extends RMQExchange<any, any>,
    TName extends string,
    TBindings extends (keyof TExchange['messages'])[]
>{

    public readonly name: TName;
    public readonly exchange: TExchange;
    public readonly bindings: TBindings;
    public readonly bindingParams: AnyRMQBindingParams;
    public readonly options: RMQQueueOptions;

    private resolvedNameCached: string;
    private resolvedRoutingKeysCached: string[] = [];

    public get displayName(): TName{
        return this.name;
    }

    /**
     * @return {string}
     */
    public get resolvedName(): string{
        if(this.resolvedNameCached !== undefined)
            return this.resolvedNameCached;

        this.resolvedNameCached = this.exchange.name + '.' + this.name;
        return this.resolvedNameCached;
    }

    /**
     * @return {string[]}
     */
    public get resolvedRoutingKeys(): string[]{
        if(this.resolvedRoutingKeysCached.length > 0)
            return this.resolvedRoutingKeysCached;

        const out: string[] = [];
        for(const mKey of this.bindings){
            const contract: RMQMessageContract<any> = this.exchange.messages[mKey];
            const bParams = this.bindingParams[mKey as string] || undefined;

            if(!bParams || bParams.length === 0){
                out.push(contract.routingKey.replaceAll(/\{[A-Za-z\d_\-]+\}/iug, '*'));
            }else{
                for(const param of bParams){
                    let rk: string = contract.routingKey;
                    for(const [k, v] of Object.entries(param)){
                        rk = rk.replaceAll(`{${k}}`, v.toString());
                    }

                    rk = rk.replaceAll(/\{[A-Za-z\d_\-]+\}/iug, '*');
                    out.push(rk);
                }
            }
        }

        this.resolvedRoutingKeysCached = out;
        return out;
    }

    public constructor(
        name: TName,
        exchange: TExchange,
        bindings: TBindings,
        options?: Partial<RMQQueueOptions>,
        bindingParams?: AnyRMQBindingParams
    ) {
        this.name = name;
        this.exchange = exchange;
        this.bindings = bindings;
        this.bindingParams = bindingParams ?? {};
        this.options = Object.freeze({
            durable: !!options?.durable,
            autoDelete: !!options?.autoDelete,
            exclusive: options?.exclusive === undefined ? false : options.exclusive,
            xMessageTtlMs: options?.xMessageTtlMs ?? undefined
        });
    }

    /**
     * @template {string} TSubname
     * @param {TSubname} name
     * @param {RMQBindingParams<TExchange, this>} bindingParams
     * @return {RMQQueue<TExchange, _TName, TBindings>}
     */
    public withBindingParams<TSubname extends string>(name: TSubname, bindingParams: RMQBindingParams<TExchange, this>): RMQQueue<TExchange, TSubname, TBindings>{
        return new RMQQueue<TExchange, TSubname, TBindings>(
            name,
            this.exchange,
            this.bindings,
            {...this.options},
            bindingParams
        );
    }

}

//endregion

//region Helper types

export type AnyRMQExchange = RMQExchange<RMQExchangeContract<string>, Record<string, RMQMessageContract<string>>>;
export type AnyRMQQueue = RMQQueue<AnyRMQExchange, string, string[]>;

//endregion

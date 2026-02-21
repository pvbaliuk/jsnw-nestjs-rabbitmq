import {type RabbitmqExchange} from './rabbitmq-exchange';

export type RabbitmqQueueArguments = {
    /** Per-Queue Message TTL https://www.rabbitmq.com/ttl.html#per-queue-message-ttl */
    'x-message-ttl'?: number,
    /** Queue Expiry https://www.rabbitmq.com/ttl.html#queue-ttl */
    'x-expires'?: number,
    /** https://www.rabbitmq.com/maxlength.html */
    'x-max-length'?: number,
    /** https://www.rabbitmq.com/maxlength.html */
    'x-overflow'?: 'drop-head' | 'reject-publish' | 'reject-publish-dlx',
    /** https://www.rabbitmq.com/priority.html */
    'x-max-priority'?: number,
    /** https://www.rabbitmq.com/quorum-queues.html
     * https://www.rabbitmq.com/streams.html */
    'x-queue-type'?: 'quorum' | 'classic' | 'stream',
    [k: string]: any
}

export type RabbitmqQueueBinding = {
    exchange: RabbitmqExchange;
    routingKeys?: string[];
};

export type RabbitmqQueueDeclaration = {
    name: string;
    deadLetterExchange?: RabbitmqExchange|null;
    deadLetterRoutingKey?: string|null;
    arguments?: RabbitmqQueueArguments;
    durable?: boolean;
    autoDelete?: boolean;
    exclusive?: boolean;
    bindings?: RabbitmqQueueBinding[];
}

export class RabbitmqQueue{

    public readonly _$type: 'queue' = 'queue';
    public readonly name: string;
    public readonly arguments: RabbitmqQueueArguments;
    public readonly durable: boolean;
    public readonly autoDelete: boolean;
    public readonly exclusive: boolean;
    /** https://www.rabbitmq.com/dlx.html */
    public readonly deadLetterExchange: RabbitmqExchange|null;
    /** https://www.rabbitmq.com/dlx.html */
    public readonly deadLetterRoutingKey: string|null;

    private readonly _bindings: RabbitmqQueueBinding[];
    public get bindings(): Required<RabbitmqQueueBinding>[]{
        return this._bindings.map(binding => ({
            exchange: binding.exchange,
            routingKeys: (binding.routingKeys ?? []).map(key => key)
        }));
    }

    /**
     * @param {RabbitmqQueueDeclaration} declaration
     */
    public constructor(declaration: RabbitmqQueueDeclaration) {
        this.name = declaration.name;
        this.arguments = Object.assign({}, declaration.arguments ?? {});
        this.durable = !!declaration.durable;
        this.autoDelete = !!declaration.autoDelete;
        this.exclusive = !!declaration.exclusive;
        this.deadLetterExchange = declaration.deadLetterExchange ?? null;
        this.deadLetterRoutingKey = declaration.deadLetterRoutingKey ?? null;
        this._bindings = declaration.bindings ?? [];
    }

}

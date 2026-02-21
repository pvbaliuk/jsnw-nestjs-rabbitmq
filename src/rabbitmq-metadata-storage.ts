import {type RabbitmqConstructorParams, type RabbitmqExchange, type RabbitmqQueue} from './rabbitmq';
import {getInstanceToken} from './rabbitmq.helpers';

type Metadata = {
    exchanges: Set<RabbitmqExchange>;
    queues: Set<RabbitmqQueue>;
}

type AddMetadataParams = {
    exchanges?: RabbitmqExchange[];
    queues?: RabbitmqQueue[];
};

export class RabbitmqMetadataStorage{

    /**
     * @type {Map<string, Metadata>}
     * @private
     */
    private static readonly storage: Map<string, Metadata> = new Map<string, Metadata>();

    public static addMetadata(resolvedToken: string, metadata?: AddMetadataParams): void;
    public static addMetadata(unresolvedToken: RabbitmqConstructorParams, metadata?: AddMetadataParams): void;
    /**
     * @param {string | RabbitmqConstructorParams} token
     * @param {AddMetadataParams} metadata
     */
    public static addMetadata(token: string|RabbitmqConstructorParams, metadata: AddMetadataParams = {}): void{
        token = typeof token === 'string' ? token : getInstanceToken(token);
        const {exchanges, queues} = metadata;
        if(!this.storage.has(token))
            this.storage.set(token, {exchanges: new Set(), queues: new Set()});

        const metadataStorage = this.storage.get(token)!;

        if(exchanges && exchanges.length > 0)
            for(const exchange of exchanges)
                metadataStorage.exchanges.add(exchange);

        if(queues && queues.length > 0)
            for(const queue of queues)
                metadataStorage.queues.add(queue);
    }

    public static getMetadata(resolvedToken: string): Metadata;
    public static getMetadata(unresolvedToken: RabbitmqConstructorParams): Metadata;
    /**
     * @param {string | RabbitmqConstructorParams} token
     * @return {Metadata}
     */
    public static getMetadata(token: string|RabbitmqConstructorParams): Metadata{
        token = typeof token === 'string' ? token : getInstanceToken(token);
        const metadataStorage = this.storage.get(token);
        return metadataStorage ?? {exchanges: new Set(), queues: new Set()};
    }

}

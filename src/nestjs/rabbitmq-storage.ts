import type {AnyRMQExchange, AnyRMQQueue} from '../dsl';

export class RabbitmqStorage{

    private static exchanges = new Set<AnyRMQExchange>;
    private static queues = new Set<AnyRMQQueue>;

    /**
     * @param {AnyRMQExchange[]} exchanges
     */
    public static addExchanges(exchanges: AnyRMQExchange[]): void{
        for(const exchange of exchanges)
            this.exchanges.add(exchange);
    }

    /**
     * @param {AnyRMQQueue[]} queues
     */
    public static addQueues(queues: AnyRMQQueue[]): void{
        for(const queue of queues)
            this.queues.add(queue);
    }

    /**
     * @return {AnyRMQExchange[]}
     */
    public static getExchanges(): AnyRMQExchange[]{
        return Array.from(this.exchanges);
    }

    /**
     * @return {AnyRMQQueue[]}
     */
    public static getQueues(): AnyRMQQueue[]{
        return Array.from(this.queues);
    }

}

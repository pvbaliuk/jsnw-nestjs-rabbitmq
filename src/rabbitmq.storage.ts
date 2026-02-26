import {RabbitmqExchange, RabbitmqQueue} from './rabbitmq';

export class RabbitmqStorage{

    private static exchanges = new Set<RabbitmqExchange>();
    private static queues = new Set<RabbitmqQueue>();

    /**
     * @param {RabbitmqExchange[]} exchanges
     */
    public static addExchanges(exchanges: RabbitmqExchange[]): void{
        for(const exchange of exchanges)
            this.exchanges.add(exchange);
    }

    /**
     * @param {RabbitmqQueue[]} queues
     */
    public static addQueues(queues: RabbitmqQueue[]): void{
        for(const queue of queues)
            this.queues.add(queue);
    }

    /**
     * @param {(RabbitmqExchange | RabbitmqQueue)[]} declarations
     */
    public static addAny(declarations: (RabbitmqExchange|RabbitmqQueue)[]): void{
        for(const declaration of declarations){
            if(declaration instanceof RabbitmqExchange){
                this.exchanges.add(declaration);
            }else if(declaration instanceof RabbitmqQueue){
                this.queues.add(declaration);
            }
        }
    }

    /**
     * @return {RabbitmqExchange[]}
     */
    public static getExchanges(): RabbitmqExchange[]{
        return Array.from(this.exchanges.values());
    }

    /**
     * @return {RabbitmqQueue[]}
     */
    public static getQueues(): RabbitmqQueue[]{
        return Array.from(this.queues.values());
    }

}

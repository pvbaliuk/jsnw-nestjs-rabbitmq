import {AMQP_ENTITY_KIND_TOKEN, type AMQPExchange, type AMQPQueue} from '../dsl';

export class RabbitmqStorage{

    private static exchanges = new Set<AMQPExchange<any>>;
    private static queues = new Set<AMQPQueue<any, any>>;

    /**
     * @param {AMQPExchange<any>[]} exchanges
     */
    public static addExchanges(exchanges: AMQPExchange<any>[]): void{
        for(const exchange of exchanges)
            this.exchanges.add(exchange);
    }

    /**
     * @param {AMQPQueue<any, any>[]} queues
     */
    public static addQueues(queues: AMQPQueue<any, any>[]): void{
        for(const queue of queues)
            this.queues.add(queue);
    }

    /**
     * @param {(AMQPExchange<any> | AMQPQueue<any, any>)[]} items
     */
    public static addAny(items: (AMQPExchange<any>|AMQPQueue<any, any>)[]): void{
        for(const item of items){
            if(item[AMQP_ENTITY_KIND_TOKEN] === 'exchange'){
                this.exchanges.add(item);
            }else{
                this.queues.add(item);
            }
        }
    }

    /**
     * @return {AMQPExchange<any>[]}
     */
    public static getExchanges(): AMQPExchange<any>[]{
        return Array.from(this.exchanges);
    }

    /**
     * @return {AMQPQueue<any, any>[]}
     */
    public static getQueues(): AMQPQueue<any, any>[]{
        return Array.from(this.queues);
    }

}

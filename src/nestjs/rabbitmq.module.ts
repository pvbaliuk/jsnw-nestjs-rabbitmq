import {type DynamicModule, Module} from '@nestjs/common';
import {type AnyRMQExchange, type AnyRMQQueue} from '../dsl';
import type {RabbitmqOptions} from './rabbitmq.types';
import {RabbitmqCoreModule} from './rabbitmq-core.module';
import {RabbitmqStorage} from './rabbitmq-storage';

@Module({})
export class RabbitmqModule{

    /**
     * @param {RabbitmqOptions} options
     * @return {DynamicModule}
     */
    public static forRoot(options: RabbitmqOptions): DynamicModule{
        return {
            module: RabbitmqModule,
            imports: [
                RabbitmqCoreModule.forRoot(options)
            ]
        };
    }

    /**
     * @param {{exchanges?: AnyRMQExchange[], queues?: AnyRMQQueue[]}} items
     * @return {DynamicModule}
     */
    public static forFeature(items?: {exchanges?: AnyRMQExchange[]; queues?: AnyRMQQueue[];}): DynamicModule{
        if(items){
            if('exchanges' in items && Array.isArray(items.exchanges) && items.exchanges.length > 0)
                RabbitmqStorage.addExchanges(items.exchanges);

            if('queues' in items && Array.isArray(items.queues) && items.queues.length > 0)
                RabbitmqStorage.addQueues(items.queues);
        }

        return {
            module: RabbitmqModule,
            providers: [],
            exports: []
        };
    }

}

import {Module, type DynamicModule} from '@nestjs/common';
import type {RabbitmqOptions} from './rabbitmq.types';
import {RabbitmqCoreModule} from './rabbitmq-core.module';
import {RabbitmqExchange, RabbitmqQueue} from './rabbitmq';
import {RabbitmqStorage} from './rabbitmq.storage';

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

    public static forFeature(declarations?: (RabbitmqExchange|RabbitmqQueue)[]):DynamicModule;
    public static forFeature(declarations?: {exchanges?: RabbitmqExchange[]; queues?: RabbitmqQueue[];}): DynamicModule;
    /**
     * @param {(RabbitmqExchange | RabbitmqQueue)[] | {exchanges?: RabbitmqExchange[], queues?: RabbitmqQueue[]}} declarations
     * @return {DynamicModule}
     */
    public static forFeature(declarations?: ((RabbitmqExchange|RabbitmqQueue)[])|{exchanges?: RabbitmqExchange[]; queues?: RabbitmqQueue[];}): DynamicModule{
        if(declarations){
            if(Array.isArray(declarations) && declarations.length > 0)
                RabbitmqStorage.addAny(declarations);

            if('exchanges' in declarations && Array.isArray(declarations.exchanges) && declarations.exchanges.length > 0)
                RabbitmqStorage.addExchanges(declarations.exchanges);

            if('queues' in declarations && Array.isArray(declarations.queues) && declarations.queues.length > 0)
                RabbitmqStorage.addQueues(declarations.queues);
        }

        return {
            module: RabbitmqModule,
            providers: [],
            exports: []
        };
    }

}

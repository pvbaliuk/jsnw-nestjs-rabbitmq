import {
    Global,
    Module,
    type DynamicModule,
    type FactoryProvider,
    type ValueProvider,
    type OnApplicationShutdown
} from '@nestjs/common';
import {Rabbitmq} from './rabbitmq';
import type {RabbitmqOptions} from './rabbitmq.types';
import {RABBITMQ_OPTIONS_TOKEN} from './rabbitmq.consts';
import {RabbitmqStorage} from './rabbitmq.storage';
import {RabbitmqExplorerService} from './rabbitmq-explorer.service';

@Global()
@Module({})
export class RabbitmqCoreModule implements OnApplicationShutdown{

    /**
     * @param {RabbitmqOptions} options
     * @return {DynamicModule}
     */
    public static forRoot(options: RabbitmqOptions): DynamicModule{
        const optionsProvider = this.createOptionsProvider(options),
            rabbitmqProvider = this.createRabbitmqProvider();

        return {
            module: RabbitmqCoreModule,
            providers: [
                optionsProvider,
                rabbitmqProvider,
                RabbitmqExplorerService
            ],
            exports: [
                rabbitmqProvider
            ]
        };
    }

    /**
     * @param {RabbitmqOptions} options
     * @return {ValueProvider}
     * @private
     */
    private static createOptionsProvider(options: RabbitmqOptions): ValueProvider{
        return {
            provide: RABBITMQ_OPTIONS_TOKEN,
            useValue: options
        };
    }

    /**
     * @return {FactoryProvider}
     * @private
     */
    private static createRabbitmqProvider(): FactoryProvider{
        return {
            provide: Rabbitmq,
            useFactory: (options: RabbitmqOptions) => {
                const rabbitmq = new Rabbitmq(options);

                if(options.exchanges && options.exchanges.length > 0)
                    RabbitmqStorage.addExchanges(options.exchanges);

                if(options.queues && options.queues.length > 0)
                    RabbitmqStorage.addQueues(options.queues);

                return rabbitmq;
            },
            inject: [
                RABBITMQ_OPTIONS_TOKEN
            ]
        };
    }

    /**
     * @param {Rabbitmq} rabbit
     */
    public constructor(private readonly rabbit: Rabbitmq) {}

    /**
     * @return {Promise<void>}
     */
    public async onApplicationShutdown(): Promise<void>{
        await this.rabbit.close();
    }

}

import {Global, Module, type DynamicModule, type ValueProvider, FactoryProvider} from '@nestjs/common';
import {type RabbitmqOptions} from './rabbitmq.types';
import {RABBITMQ_OPTIONS_TOKEN} from './rabbitmq.consts';
import {Rabbitmq} from './rabbitmq';

@Global()
@Module({
    imports: [],
    providers: []
})
export class RabbitmqCoreModule{

    public static forRoot(options: RabbitmqOptions): DynamicModule{
        const optionsProvider = RabbitmqCoreModule.createOptionsProvider(options);
        return {
            module: RabbitmqCoreModule,
            imports: [],
            providers: [
                optionsProvider,
                Rabbitmq
            ],
            exports: [
                Rabbitmq
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

}

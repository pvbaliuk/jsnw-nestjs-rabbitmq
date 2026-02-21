import {type DynamicModule, Module} from '@nestjs/common';
import type {RabbitmqForFeatureParams, RabbitmqForRootParams} from './rabbitmq.types';
import {RabbitmqMetadataStorage} from './rabbitmq-metadata-storage';
import {RabbitmqCoreModule} from './rabbitmq-core.module';
import {getInstanceToken, resolveInstanceName} from './rabbitmq.helpers';

@Module({})
export class RabbitmqModule{

    /**
     * @param {RabbitmqForRootParams} params
     * @return {DynamicModule}
     */
    public static forRoot(params: RabbitmqForRootParams): DynamicModule{
        RabbitmqMetadataStorage.addMetadata(params, {
            exchanges: params.exchanges ?? [],
            queues: params.queues ?? []
        });

        return {
            module: RabbitmqModule,
            imports: [
                RabbitmqCoreModule.forRoot(params)
            ],
            exports: [],
            providers: []
        };
    }

    /**
     * @param {RabbitmqForFeatureParams} params
     * @return {DynamicModule}
     */
    public static forFeature(params: RabbitmqForFeatureParams): DynamicModule{
        RabbitmqMetadataStorage.addMetadata(getInstanceToken(resolveInstanceName(params.name)), {
            exchanges: params.exchanges ?? [],
            queues: params.queues ?? []
        });

        return {
            module: RabbitmqModule,
            imports: [],
            providers: [],
            exports: []
        };
    }

}

import {type DynamicModule, type FactoryProvider, type Provider, Global, Module} from '@nestjs/common';
import type {RabbitmqForRootParams} from './rabbitmq.types';
import {RABBITMQ_INSTANCE_DEFAULT_NAME} from './rabbitmq.consts';
import {getInstanceToken} from './rabbitmq.helpers';
import {RabbitmqInstancesManager} from './rabbitmq-instances-manager';
import {RabbitmqExplorerService} from './rabbitmq-explorer.service';
import {Rabbitmq} from './rabbitmq';

@Global()
@Module({
    providers: [
        RabbitmqInstancesManager,
        RabbitmqExplorerService
    ]
})
export class RabbitmqCoreModule{

    /**
     * @param {RabbitmqForRootParams} params
     * @return {DynamicModule}
     */
    public static forRoot(params: RabbitmqForRootParams): DynamicModule{
        const providers: Provider[] = [];
        const instanceProvider = this.createInstanceProvider(params);

        providers.push(instanceProvider);
        if(params.isDefault)
            providers.push({
                provide: RABBITMQ_INSTANCE_DEFAULT_NAME,
                useExisting: getInstanceToken(params)
            });

        return {
            module: RabbitmqCoreModule,
            providers: providers,
            exports: providers
        };
    }

    /**
     * @param {RabbitmqForRootParams} params
     * @return {FactoryProvider}
     * @private
     */
    private static createInstanceProvider(params: RabbitmqForRootParams): FactoryProvider{
        const instanceToken = getInstanceToken(params);
        return {
            provide: instanceToken,
            useFactory: (im: RabbitmqInstancesManager) => {
                const existingInstance = im.getInstance(instanceToken);
                if(existingInstance)
                    return existingInstance;

                const instance = new Rabbitmq({
                    name: params.name,
                    connectionName: params.connectionName,
                    hostname: params.hostname,
                    port: params.port,
                    username: params.username,
                    password: params.password,
                    vhost: params.vhost,
                    connectionTimeout: params.connectionTimeout
                });

                im.addInstance(instanceToken, instance);
                return instance;
            },
            inject: [
                RabbitmqInstancesManager
            ]
        };
    }

}

import {Injectable, Logger, type OnApplicationBootstrap} from '@nestjs/common';
import {DiscoveryService, MetadataScanner, Reflector} from '@nestjs/core';
import {RabbitmqInstancesManager} from './rabbitmq-instances-manager';
import {RabbitmqMetadataStorage} from './rabbitmq-metadata-storage';
import {getInstanceToken} from './rabbitmq.helpers';
import type {RabbitmqSubscriptionMetadata} from './rabbitmq.types';
import {RABBITMQ_SUBSCRIBE_METADATA_KEY} from './rabbitmq.consts';

@Injectable()
export class RabbitmqExplorerService implements OnApplicationBootstrap{

    private readonly logger = new Logger(RabbitmqExplorerService.name);

    public constructor(
        private readonly discoveryService: DiscoveryService,
        private readonly metadataScanner: MetadataScanner,
        private readonly reflector: Reflector,
        private readonly instancesManager: RabbitmqInstancesManager
    ) {}

    /**
     * @return {Promise<void>}
     */
    public async onApplicationBootstrap(): Promise<void>{
        await this.setupInfrastructure();
        await this.setupSubscribers();
    }

    /**
     * @return {Promise<void>}
     * @private
     */
    private async setupInfrastructure(): Promise<void>{
        const instances = this.instancesManager.getAllInstances();
        for(const instance of instances){
            const metadata = RabbitmqMetadataStorage.getMetadata(getInstanceToken(instance.name));
            if(!metadata || (metadata.exchanges.size === 0 && metadata.queues.size === 0))
                continue;

            const exchanges = Array.from(metadata.exchanges),
                queues = Array.from(metadata.queues);

            if(exchanges.length > 0)
                await Promise.all(exchanges.map(exchange => instance.declareExchange(exchange)));

            if(queues.length > 0)
                await Promise.all(queues.map(queue => instance.declareQueue(queue)));
        }
    }

    /**
     * @return {Promise<void>}
     * @private
     */
    private async setupSubscribers(): Promise<void>{
        const wrappers = [
            ...this.discoveryService.getProviders(),
            ...this.discoveryService.getControllers()
        ];

        for(const wrapper of wrappers){
            const {instance} = wrapper;
            if(!instance || typeof instance !== 'object')
                continue;

            const prototype = Object.getPrototypeOf(instance);
            if(!prototype)
                continue;

            const methodNames = this.metadataScanner.getAllMethodNames(prototype);
            for(const methodName of methodNames)
                await this.tryRegisterSubscriber(instance, methodName);
        }
    }

    /**
     * @param {any} instance
     * @param {string} methodName
     * @return {Promise<void>}
     * @private
     */
    private async tryRegisterSubscriber(instance: any, methodName: string): Promise<void>{
        const methodRef = instance[methodName];
        const subscriptionMetadata = this.reflector.get<RabbitmqSubscriptionMetadata>(RABBITMQ_SUBSCRIBE_METADATA_KEY, methodRef);
        if(!subscriptionMetadata)
            return;

        const rabbitmqInstance = this.instancesManager.getInstance(subscriptionMetadata.instanceToken);
        if(!rabbitmqInstance){
            this.logger.error(`Instance ${subscriptionMetadata.instanceName}" not found for subscriber ${instance.constructor.name}.${methodName}`)
            return;
        }

        this.logger.log(`Registering subscriber: ${instance.constructor.name}.${methodName} -> ${subscriptionMetadata.queue.name}`);
        await rabbitmqInstance.subscribe({
            id: subscriptionMetadata.id,
            queue: subscriptionMetadata.queue,
            requeue: subscriptionMetadata.requeue,
            concurrency: subscriptionMetadata.concurrency,
            prefetchSize: subscriptionMetadata.prefetchSize,
            prefetchCount: subscriptionMetadata.prefetchCount,
            autoStart: subscriptionMetadata.autoStart,
            validation: subscriptionMetadata.validation
        }, {instance: instance, methodName: methodName});
    }

}

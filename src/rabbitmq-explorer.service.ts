import {Injectable, type OnApplicationBootstrap} from '@nestjs/common';
import {DiscoveryService, MetadataScanner, Reflector} from '@nestjs/core';
import {Rabbitmq, type RabbitmqSubscribeParams} from './rabbitmq';
import {RabbitmqStorage} from './rabbitmq.storage';
import {RABBITMQ_SUBSCRIPTION_METADATA} from './rabbitmq.consts';

@Injectable()
export class RabbitmqExplorerService implements OnApplicationBootstrap{

    public constructor(
        private readonly discoveryService: DiscoveryService,
        private readonly metadataScanner: MetadataScanner,
        private readonly reflector: Reflector,
        private readonly rabbitmq: Rabbitmq
    ) {}

    /**
     * @return {Promise<void>}
     */
    public async onApplicationBootstrap(): Promise<void>{
        await this.setupInfrastructure();
        await this.discoverSubscribers();
    }

    /**
     * @return {Promise<void>}
     * @private
     */
    private async setupInfrastructure(): Promise<void>{
        const exchanges = RabbitmqStorage.getExchanges(),
            queues = RabbitmqStorage.getQueues();

        if(exchanges.length > 0)
            await Promise.all(exchanges.map(exchange => this.rabbitmq.declareExchange(exchange)));

        if(queues.length > 0)
            await Promise.all(queues.map(queue => this.rabbitmq.declareQueue(queue)));
    }

    /**
     * @return {Promise<void>}
     * @private
     */
    private async discoverSubscribers(): Promise<void>{
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
                await this.registerIfSubscriber(instance, methodName);
        }
    }

    /**
     * @param {any} instance
     * @param {string} methodName
     * @return {Promise<void>}
     * @private
     */
    private async registerIfSubscriber(instance: any, methodName: string): Promise<void>{
        const methodRef = instance[methodName];
        const metadata = this.reflector.get<RabbitmqSubscribeParams>(RABBITMQ_SUBSCRIPTION_METADATA, methodRef);

        if(!metadata)
            return;

        await this.rabbitmq.subscribe(metadata, {instance, methodName});
    }

}

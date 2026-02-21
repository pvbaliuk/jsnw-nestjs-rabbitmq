import {Injectable, type OnApplicationShutdown} from '@nestjs/common';
import {Rabbitmq, type RabbitmqConstructorParams} from './rabbitmq';
import {getInstanceToken} from './rabbitmq.helpers';

@Injectable()
export class RabbitmqInstancesManager implements OnApplicationShutdown{

    /**
     * @type {Map<string, Rabbitmq>}
     * @private
     */
    private readonly instances = new Map<string, Rabbitmq>();

    public addInstance(resolvedToken: string, instance: Rabbitmq): void;
    public addInstance(unresolvedToken: RabbitmqConstructorParams, instance: Rabbitmq): void;
    /**
     * @param {string | RabbitmqConstructorParams} token
     * @param {Rabbitmq} instance
     */
    public addInstance(token: string|RabbitmqConstructorParams, instance: Rabbitmq): void{
        token = typeof token === 'string' ? token : getInstanceToken(token);
        if(this.instances.has(token))
            return;

        this.instances.set(token, instance);
    }

    public getInstance(resolvedToken: string): Rabbitmq|null;
    public getInstance(unresolvedToken: RabbitmqConstructorParams): Rabbitmq|null;
    /**
     * @param {string | RabbitmqConstructorParams} token
     * @return {Rabbitmq | null}
     */
    public getInstance(token: string|RabbitmqConstructorParams): Rabbitmq|null{
        token = typeof token === 'string' ? token : getInstanceToken(token);
        return this.instances.get(token) ?? null;
    }

    public hasInstance(resolvedToken: string): boolean;
    public hasInstance(unresolvedToken: RabbitmqConstructorParams): boolean;
    /**
     * @param {string | RabbitmqConstructorParams} token
     * @return {boolean}
     */
    public hasInstance(token: string|RabbitmqConstructorParams): boolean{
        token = typeof token === 'string' ? token : getInstanceToken(token);
        return this.instances.has(token);
    }

    /**
     * @return {Rabbitmq[]}
     */
    public getAllInstances(): Rabbitmq[]{
        return Array.from(this.instances.values());
    }

    /**
     * @return {Promise<void>}
     */
    public async onApplicationShutdown(): Promise<void>{
        await Promise.allSettled(this.getAllInstances().map(instance => instance.close()));
    }

}

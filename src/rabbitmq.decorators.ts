import {SetMetadata} from '@nestjs/common';
import type {RabbitmqSubscribeDecoratorParams, RabbitmqSubscriptionMetadata} from './rabbitmq.types';
import {RABBITMQ_SUBSCRIBE_METADATA_KEY} from './rabbitmq.consts';
import {getInstanceToken} from './rabbitmq.helpers';

/**
 * @return {MethodDecorator}
 * @constructor
 */
export const RabbitmqSubscribe = (params: RabbitmqSubscribeDecoratorParams): MethodDecorator => {
    return (target: object, key: string|symbol, descriptor: TypedPropertyDescriptor<any>) => {
        SetMetadata(RABBITMQ_SUBSCRIBE_METADATA_KEY, <RabbitmqSubscriptionMetadata>{
            instanceName: params.instanceName,
            instanceToken: getInstanceToken(params.instanceName),
            id: params.id,
            queue: params.queue,
            autoStart: params.autoStart !== undefined ? params.autoStart : true,
            concurrency: params.concurrency ?? 1,
            prefetchSize: params.prefetchSize ?? 0,
            prefetchCount: params.prefetchCount ?? 1,
            requeue: params.requeue,
            validation: params.validation ? {
                schema: params.validation.schema,
                onFail: params.validation.onFail ?? 'drop'
            } : null
        })(target, key, descriptor);

        return descriptor;
    }
}

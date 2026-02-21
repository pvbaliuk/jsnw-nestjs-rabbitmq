import {Inject, SetMetadata} from '@nestjs/common';
import type {RabbitmqSubscribeDecoratorParams, RabbitmqSubscriptionMetadata} from './rabbitmq.types';
import {RABBITMQ_INSTANCE_DEFAULT_NAME, RABBITMQ_SUBSCRIBE_METADATA_KEY} from './rabbitmq.consts';
import {getInstanceToken} from './rabbitmq.helpers';

/**
 * @param {string} [instanceName = RABBITMQ_INSTANCE_DEFAULT_NAME]
 * @return {PropertyDecorator & ParameterDecorator}
 * @constructor
 */
export const InjectRabbitmq = (instanceName: string = RABBITMQ_INSTANCE_DEFAULT_NAME): PropertyDecorator & ParameterDecorator =>
    Inject(getInstanceToken(instanceName));

/**
 * @return {MethodDecorator}
 * @constructor
 */
export const RabbitmqSubscribe = (params: RabbitmqSubscribeDecoratorParams): MethodDecorator => {
    return (target: object, key: string|symbol, descriptor: TypedPropertyDescriptor<any>) => {
        SetMetadata(RABBITMQ_SUBSCRIBE_METADATA_KEY, <RabbitmqSubscriptionMetadata>{
            instanceName: params.instanceName ?? RABBITMQ_INSTANCE_DEFAULT_NAME,
            instanceToken: getInstanceToken(params.instanceName ?? RABBITMQ_INSTANCE_DEFAULT_NAME),
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

import {SetMetadata} from '@nestjs/common';
import {type RabbitmqSubscribeParams} from './rabbitmq';
import {RABBITMQ_SUBSCRIPTION_METADATA} from './rabbitmq.consts';

/**
 * @param {RabbitmqSubscribeParams} subscription
 * @return {MethodDecorator}
 * @constructor
 */
export const RabbitmqSubscribe = (subscription: RabbitmqSubscribeParams): MethodDecorator => {
    return (target: object, key: string|symbol, descriptor: TypedPropertyDescriptor<any>) => {
        SetMetadata(RABBITMQ_SUBSCRIPTION_METADATA, subscription)(target, key, descriptor);
        return descriptor;
    };
}

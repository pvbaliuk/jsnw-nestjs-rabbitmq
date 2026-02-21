export * from './rabbitmq';
export {RabbitmqModule} from './rabbitmq.module';
export type {RabbitmqForRootParams, RabbitmqForFeatureParams, RabbitmqSubscribeDecoratorParams} from './rabbitmq.types';
export {RabbitmqSubscribe, InjectRabbitmq} from './rabbitmq.decorators';

export {type AsyncMessage} from 'rabbitmq-client';

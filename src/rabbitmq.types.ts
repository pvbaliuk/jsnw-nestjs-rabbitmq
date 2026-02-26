import type {
    RabbitmqConstructorParams, RabbitmqExchange, RabbitmqQueue,
    RabbitmqSubscribeParams
} from './rabbitmq';

export type RabbitmqForRootParams = RabbitmqConstructorParams & Omit<RabbitmqForFeatureParams, 'name'> & {
    isDefault?: boolean;
};

export type RabbitmqForFeatureParams = {
    name: string;
    exchanges?: RabbitmqExchange[];
    queues?: RabbitmqQueue[];
}

export type RabbitmqSubscribeDecoratorParams = RabbitmqSubscribeParams & {
    instanceName?: string;
}

export type RabbitmqSubscriptionMetadata = Required<RabbitmqSubscribeParams> & {
    instanceName: string;
    instanceToken: string;
    validation: Required<RabbitmqSubscribeParams['validation']>|null;
}

export type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};

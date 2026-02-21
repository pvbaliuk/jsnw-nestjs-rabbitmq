import {type RabbitmqConstructorParams} from './rabbitmq';
import {RABBITMQ_INSTANCE_TOKEN_PREFIX} from './rabbitmq.consts';

export function resolveInstanceName(instanceName: string): string;
export function resolveInstanceName(params: RabbitmqConstructorParams): string;
/**
 * @param {string | RabbitmqConstructorParams} arg
 * @return {string}
 */
export function resolveInstanceName(arg: string|RabbitmqConstructorParams): string{
    if(typeof arg === 'string')
        return arg.toLowerCase();

    if(arg.name && arg.name.trim() !== '')
        return arg.name.trim().toLowerCase();

    return `${arg.hostname}:${arg.port}/${(arg.vhost?.trim() ?? '').replace(/^\/|\/$/, '')}`.toLowerCase();
}

export function getInstanceToken(instanceName: string): string;
export function getInstanceToken(params: RabbitmqConstructorParams): string;
/**
 * @param {string | RabbitmqConstructorParams} arg
 * @return {string}
 */
export function getInstanceToken(arg: string | RabbitmqConstructorParams): string{
    if(typeof arg === 'string'){
        // It is an instance name
        return `${RABBITMQ_INSTANCE_TOKEN_PREFIX}${arg}`.toLowerCase();
    }

    return `${RABBITMQ_INSTANCE_TOKEN_PREFIX}${resolveInstanceName(arg)}`.toLowerCase();
}

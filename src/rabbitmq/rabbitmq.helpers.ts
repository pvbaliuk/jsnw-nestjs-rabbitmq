import {ConsumerStatus} from 'rabbitmq-client';
import {type RabbitmqResponse} from './rabbitmq';

/**
 * @param {RabbitmqResponse | string} response
 * @return {ConsumerStatus}
 */
export const mapRabbitmqResponseToConsumerStatus = (response: RabbitmqResponse|string): ConsumerStatus => {
    response = response.toLowerCase() as RabbitmqResponse | string;
    switch(response){
        case 'ack': return ConsumerStatus.ACK;
        case 'requeue': return ConsumerStatus.REQUEUE;
        case 'drop': return ConsumerStatus.DROP;
    }

    return ConsumerStatus.DROP;
}

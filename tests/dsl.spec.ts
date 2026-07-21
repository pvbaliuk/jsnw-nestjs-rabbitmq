import {createExchange, RMQExchange, RMQQueue} from '../src';

describe('dsl', () => {
    let exchange: RMQExchange<{name: 'events', type: 'topic'}, {
        testEvent: {
            routingKey: 'event.{id}'
        },
        userEvent: {
            routingKey: 'users.{id}.{action}'
        },
        testDirectEvent: {
            routingKey: 'event'
        }
    }>;

    let queue: RMQQueue<typeof exchange, 'events-queue', ['testEvent', 'userEvent', 'testDirectEvent']>;

    beforeEach(() => {
        exchange = createExchange({
            name: 'events',
            type: 'topic'
        }, {
            testEvent: {
                routingKey: 'event.{id}'
            },
            userEvent: {
                routingKey: 'users.{id}.{action}'
            },
            testDirectEvent: {
                routingKey: 'event'
            }
        });

        queue = exchange.createQueue('events-queue', ['testEvent', 'userEvent', 'testDirectEvent']);
    });

    describe('queue', () => {
        it('correctly resolves queue name', () => {
            expect(queue.resolvedName).toBe('events.events-queue');
        });

        it('correctly resolves queue name for child queue', () => {
            expect(queue.withBindingParams('sub', {}).resolvedName).toBe('events.events-queue.sub');
        });

        it('correctly resolves routing keys', () => {
            expect(queue.resolvedRoutingKeys.sort())
                .toEqual(['event', 'event.*', 'users.*.*'].sort());
        });

        it('correctly resolves routing keys for queue with binding params specified', () => {
            expect(queue.withBindingParams('events-queue-1', {
                testEvent: [{id: '1'}, {id: '2'}, {id: '3'}],
                userEvent: [{id: '1'}, {id: '2', action: 'update'}]
            }).resolvedRoutingKeys.sort()).toEqual([
                'event',
                'event.1', 'event.2', 'event.3',
                'users.1.*',
                'users.2.update'
            ].sort());
        });
    });
});

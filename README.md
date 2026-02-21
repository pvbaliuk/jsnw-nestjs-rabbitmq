# @jsnw/nestjs-rabbitmq

NestJS module for RabbitMQ integration using [rabbitmq-client](https://www.npmjs.com/package/rabbitmq-client).

## Installation

```bash
npm i -s @jsnw/nestjs-rabbitmq
```

Additionally, you can install `zod` and `rabbitmq-client`

## Quick Start

```typescript
import { Module } from '@nestjs/common';
import { RabbitmqModule, RabbitmqExchange, RabbitmqQueue } from '@jsnw/nestjs-rabbitmq';

@Module({
  imports: [
    RabbitmqModule.forRoot({
      name: 'main',
      hostname: 'localhost',
      port: 5672,
      username: 'guest',
      password: 'guest',
      isDefault: true
    })
  ]
})
export class AppModule {}
```

## Declaring Exchanges and Queues

```typescript
const ordersExchange = new RabbitmqExchange({
  name: 'orders',
  type: 'topic',
  durable: true
});

const ordersQueue = new RabbitmqQueue({
  name: 'order.created',
  durable: true,
  bindings: [
    { exchange: ordersExchange, routingKeys: ['order.created'] }
  ]
});

RabbitmqModule.forRoot({
  name: 'main',
  hostname: 'localhost',
  port: 5672,
  username: 'guest',
  password: 'guest',
  exchanges: [ordersExchange],
  queues: [ordersQueue]
})
```

## Publishing Messages

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRabbitmq, Rabbitmq } from '@jsnw/nestjs-rabbitmq';

@Injectable()
export class OrderService {
  constructor(
    @InjectRabbitmq() // injects default instance
    private readonly rabbitmq: Rabbitmq
  ) {}

  async createOrder(data: any) {
    await this.rabbitmq.publish({
      type: 'json',
      message: data,
      exchange: ordersExchange,
      routingKey: 'order.created'
    });
  }
}
```

To inject a specific instance by name:

```typescript
@InjectRabbitmq('main')
private readonly rabbitmq: Rabbitmq
```

## Subscribing to Queues

```typescript
import { Injectable } from '@nestjs/common';
import { RabbitmqSubscribe, type AsyncMessage } from '@jsnw/nestjs-rabbitmq';

@Injectable()
export class OrderConsumer {
  @RabbitmqSubscribe({
    queue: ordersQueue,
    concurrency: 5
  })
  async handleOrderCreated(data: any, message: AsyncMessage) {
    console.log('Order created:', data);
    return 'ack'; // or 'drop', 'requeue'
  }
}
```

### Subscriber Options

- `instanceName`: RabbitMQ instance name
- `queue` (required): Queue to subscribe to
- `concurrency`: Number of concurrent message handlers (default: 1)
- `prefetchCount`: Number of messages to prefetch (default: 1)
- `prefetchSize`: Size of messages to prefetch in bytes (default: 0)
- `requeue`: Whether to requeue failed messages (default: false)
- `autoStart`: Auto-start consumer on boot (default: true)
- `id`: Unique identifier for manual start control

## Message Validation

Use Zod schemas to validate incoming messages:

```typescript
import { z } from 'zod';

const orderSchema = z.object({
  orderId: z.string(),
  amount: z.number()
});

@RabbitmqSubscribe({
  instanceName: 'main',
  queue: ordersQueue,
  validation: {
    schema: orderSchema,
    onFail: 'drop' // or 'ack', 'requeue'
  }
})
async handleOrderCreated(data: z.infer<typeof orderSchema>) {
  // data is typed and validated
  return 'ack';
}
```

## Dead Letter Exchanges

```typescript
const dlxExchange = new RabbitmqExchange({
  name: 'orders.dlx',
  type: 'topic',
  durable: true
});

const queueWithDlx = new RabbitmqQueue({
  name: 'order.created',
  durable: true,
  deadLetterExchange: dlxExchange,
  deadLetterRoutingKey: 'order.failed',
  bindings: [{ exchange: ordersExchange, routingKeys: ['order.created'] }]
});
```

## Multiple Instances

```typescript
RabbitmqModule.forRoot({
  name: 'instance1',
  hostname: 'localhost',
  port: 5672,
  username: 'guest',
  password: 'guest',
  isDefault: true
})

RabbitmqModule.forRoot({
  name: 'instance2',
  hostname: 'other-host',
  port: 5672,
  username: 'guest',
  password: 'guest'
})
```

## License

MIT

## Author

Pavlo Baliuk (jsnow0177@gmail.com)

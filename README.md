# @jsnw/nestjs-rabbitmq

**A lightweight, strictly typed, and predictable RabbitMQ module for NestJS**

## Key features
- [rabbitmq-client](https://www.npmjs.com/package/rabbitmq-client) inside
- Full validation for both incoming and outgoing messages using [zod](https://www.npmjs.com/package/zod)
- Single connection
- Type-Safe publishing: You cannot publish an invalid payload
- Exchanges and queues are automatically declared upon application bootstrap
- No AI. The code is written by human, not a machine

## Installation

```bash
npm i -s @jsnw/nestjs-rabbitmq @nestjs/core@11 @nestjs/common@11
```

Optionally, you can install `zod` and `rabbitmq-client`

## Quick Start
### 1. Define exchanges and queues

```ts
import {RabbitmqExchange, RabbitmqQueue} from '@jsnw/nestjs-rabbitmq';

export const MY_EXCHANGE = new RabbitmqExchange({
    name: 'my_exchange',
    type: 'direct',
    durable: true,
    autoDelete: false
});

export const MY_QUEUE = new RabbitmqQueue({
    name: 'my_queue',
    durable: true,
    autoDelete: false,
    bindings: [
        {exchange: MY_EXCHANGE, routingKeys: ['user.created']}
    ]
});

```

### 2. Register the module

```ts
// app.module.ts
import {Module} from '@nestjs/common';
import {RabbitmqModule} from '@jsnw/nestjs-rabbitmq';

@Module({
    imports: [
        RabbitmqModule.forRoot({
            hostname: 'localhost',
            port: 5672,
            username: 'guest',
            password: 'guest',
            exchanges: [MY_EXCHANGE],
            queues: [MY_QUEUE]
        })
    ]
})
export class AppModule {}
```

### 3. Define a Message Contract

```ts
import {z} from 'zod';
import {RabbitmqMessage} from '@jsnw/nestjs-rabbitmq';

export const USER_CREATED_EVENT = RabbitmqMessage.template({
    type: 'json',
    exchange: MY_EXCHANGE,
    durable: true,
    routingKey: 'user.created',
    schema: z.object({
        id: z.number(),
        email: z.string().email()
    })
});
```

### 4. Publishing messages
```ts
import {Injectable} from '@nestjs/common';
import {Rabbitmq} from '@jsnw/nestjs-rabbitmq';

@Injectable()
export class UserService {

    constructor(private readonly rabbit: Rabbitmq){}
    
    async create(dto: any){
        await this.rabbit.publish(
            USER_CREATED_EVENT.make({
                id: 1, 
                email: 'example@example.com'
            })
        );
    }

}
```

### 5. Subscribing to messages

```ts
import {Injectable} from '@nestjs/common';
import {RabbitmqSubscribe, type AsyncMessage} from '@jsnw/nestjs-rabbitmq';

@Injectable()
export class NotificationsService {

    @RabbitmqSubscribe({
        queue: MY_QUEUE,
        validation: {
            schema: USER_CREATED_EVENT.schema,
            onFail: 'drop'
        }
    })
    async onUserCreated(data: z.infer<typeof USER_CREATED_EVENT.schema>, message: AsyncMessage) {

    }

}
```

## Author
Pavlo Baliuk (jsnow0177@gmail.com)

## License
MIT

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

## Quick Start [WIP]
WIP

## Author
Pavlo Baliuk (jsnow0177@gmail.com)

## License
MIT

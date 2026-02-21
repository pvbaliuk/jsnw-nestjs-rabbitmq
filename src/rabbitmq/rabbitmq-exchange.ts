export type RabbitmqExchangeType = 'direct' | 'topic';

export type RabbitmqExchangeDeclaration = {
    name: string;
    type: RabbitmqExchangeType;
    durable?: boolean;
    autoDelete?: boolean;
};

export class RabbitmqExchange{

    public readonly _$type: 'exchange' = 'exchange';
    public readonly name: string;
    public readonly type: RabbitmqExchangeType;
    public readonly durable: boolean;
    public readonly autoDelete: boolean;

    /**
     * @param {RabbitmqExchangeDeclaration} declaration
     */
    public constructor(declaration: RabbitmqExchangeDeclaration) {
        this.name = declaration.name;
        this.type = declaration.type;
        this.durable = !!declaration.durable;
        this.autoDelete = !!declaration.autoDelete;
    }

}

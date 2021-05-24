import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NOTIFICATION_SERVICE } from 'src/constants';
import {
  Order,
  OrderItemTopping,
  OrderItem,
  Delivery,
  Payment,
  Invoice,
  PaypalPayment,
  CashPayment,
} from './entities';
import { OrderFulfillmentModule } from 'src/order-fulfillment/order-fulfillment.module';

@Module({
  imports: [
    OrderFulfillmentModule,
    TypeOrmModule.forFeature([
      Order,
      OrderItemTopping,
      OrderItem,
      Delivery,
      Payment,
      Invoice,
      PaypalPayment,
      CashPayment,
    ]),
    ClientsModule.registerAsync([
      {
        name: NOTIFICATION_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get('AMQP_URL') as string],
            queue: configService.get('NOTIFICATION_AMQP_QUEUE'),
            queueOptions: {
              durable: false,
            },
          },
        }),
      },
    ]),
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}

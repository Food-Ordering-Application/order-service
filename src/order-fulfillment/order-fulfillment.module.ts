import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DELIVERY_SERVICE,
  NOTIFICATION_SERVICE,
  USER_SERVICE,
} from 'src/constants';
import {
  Order,
  OrderItemTopping,
  OrderItem,
  Delivery,
  Payment,
  Invoice,
} from '../order/entities';
import { OrderFulfillmentController } from './order-fulfillment.controller';
import { OrderFulfillmentService } from './order-fulfillment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItemTopping,
      OrderItem,
      Delivery,
      Payment,
      Invoice,
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
      {
        name: DELIVERY_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get('AMQP_URL') as string],
            queue: configService.get('DELIVERY_AMQP_QUEUE'),
            queueOptions: {
              durable: false,
            },
          },
        }),
      },
      {
        name: USER_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get('AMQP_URL') as string],
            queue: configService.get('USER_AMQP_QUEUE'),
            queueOptions: {
              durable: false,
            },
          },
        }),
      },
    ]),
  ],
  controllers: [OrderFulfillmentController],
  providers: [OrderFulfillmentService],
  exports: [OrderFulfillmentService],
})
export class OrderFulfillmentModule {}

import { OrderFulfillmentModule } from './order-fulfillment/order-fulfillment.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { DatabaseModule } from './database/database.module';
import { OrderModule } from './order/order.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  DELIVERY_SERVICE,
  NOTIFICATION_SERVICE,
  RESTAURANT_SERVICE,
  USER_SERVICE,
} from './constants';

@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: Joi.object({
        POSTGRES_HOST: Joi.string().required(),
        POSTGRES_PORT: Joi.number().required(),
        POSTGRES_USER: Joi.string().required(),
        POSTGRES_PASSWORD: Joi.string().required(),
        POSTGRES_DB: Joi.string().required(),
      }),
    }),
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
      {
        name: RESTAURANT_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get('AMQP_URL') as string],
            queue: configService.get('RESTAURANT_AMQP_QUEUE'),
            queueOptions: {
              durable: false,
            },
          },
        }),
      },
    ]),

    DatabaseModule,
    OrderModule,
    OrderFulfillmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

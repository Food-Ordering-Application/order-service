import { Global, Module } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import {
  DELIVERY_SERVICE,
  NOTIFICATION_SERVICE,
  RESTAURANT_SERVICE,
  USER_SERVICE,
} from '../constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: USER_SERVICE,
      useFactory: (configService: ConfigService) => {
        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get('AMQP_URL') as string],
            queue: configService.get('USER_AMQP_QUEUE'),
            queueOptions: {
              durable: false,
            },
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: RESTAURANT_SERVICE,
      useFactory: (configService: ConfigService) => {
        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get('AMQP_URL') as string],
            queue: configService.get('RESTAURANT_AMQP_QUEUE'),
            queueOptions: {
              durable: false,
            },
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: DELIVERY_SERVICE,
      useFactory: (configService: ConfigService) => {
        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get('AMQP_URL') as string],
            queue: configService.get('DELIVERY_AMQP_QUEUE'),
            queueOptions: {
              durable: false,
            },
          },
        });
      },
      inject: [ConfigService],
    },
    {
      provide: NOTIFICATION_SERVICE,
      useFactory: (configService: ConfigService) => {
        return ClientProxyFactory.create({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get('AMQP_URL') as string],
            queue: configService.get('NOTIFICATION_AMQP_QUEUE'),
            queueOptions: {
              durable: false,
            },
          },
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [
    DELIVERY_SERVICE,
    NOTIFICATION_SERVICE,
    RESTAURANT_SERVICE,
    USER_SERVICE,
  ],
})
export class MicroserviceModule {}

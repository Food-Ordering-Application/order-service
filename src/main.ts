import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.AMQP_URL],
        queue: process.env.ORDER_AMQP_QUEUE,
        queueOptions: {
          durable: false,
        },
      },
    },
  );
  app.listen(() => console.log('Order microservice is listening'));
}
bootstrap();

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
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}

import { CacheModule } from './../cache/cache.module';
import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DELIVERY_SERVICE,
  NOTIFICATION_SERVICE,
  RESTAURANT_SERVICE,
  USER_SERVICE,
} from 'src/constants';
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
import { DeliveryLocation } from './entities/delivery-location.entity';

@Module({
  imports: [
    OrderFulfillmentModule,
    CacheModule,
    TypeOrmModule.forFeature([
      Order,
      OrderItemTopping,
      OrderItem,
      Delivery,
      Payment,
      Invoice,
      PaypalPayment,
      CashPayment,
      DeliveryLocation,
    ]),
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}

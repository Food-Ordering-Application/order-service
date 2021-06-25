import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Delivery,
  Invoice,
  Order,
  OrderItem,
  OrderItemTopping,
  Payment,
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
  ],
  controllers: [OrderFulfillmentController],
  providers: [OrderFulfillmentService],
  exports: [OrderFulfillmentService],
})
export class OrderFulfillmentModule {}

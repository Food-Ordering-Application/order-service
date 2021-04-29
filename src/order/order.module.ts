import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Order,
  OrderStatus,
  PaymentType,
  OrderItemTopping,
  OrderItem,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      PaymentType,
      OrderStatus,
      OrderItemTopping,
      OrderItem,
    ]),
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}

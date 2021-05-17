import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Order,
  OrderItemTopping,
  OrderItem,
  Delivery,
  Payment,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderItemTopping,
      OrderItem,
      Delivery,
      Payment,
    ]),
  ],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}

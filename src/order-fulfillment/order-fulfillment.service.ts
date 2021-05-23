import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DELIVERY_SERVICE, NOTIFICATION_SERVICE } from 'src/constants';
import { Delivery, Order, Payment } from 'src/order/entities';
import { Repository } from 'typeorm';

@Injectable()
export class OrderFulfillmentService {
  constructor(
    @InjectRepository(Delivery)
    private deliveryRepository: Repository<Delivery>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @Inject(NOTIFICATION_SERVICE)
    private notificationServiceClient: ClientProxy,
    @Inject(DELIVERY_SERVICE)
    private deliveryServiceClient: ClientProxy,
  ) {}

  async sendOrderEvent(order: Order) {
    this.notificationServiceClient.emit('orderPlacedEvent', order);
  }
}

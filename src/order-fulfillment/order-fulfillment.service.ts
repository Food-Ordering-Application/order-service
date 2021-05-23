import { DeliveryStatus, OrdStatus } from 'src/order/enums';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DELIVERY_SERVICE, NOTIFICATION_SERVICE } from 'src/constants';
import { Delivery, Order, Payment } from 'src/order/entities';
import { Repository } from 'typeorm';
import { RestaurantConfirmOrderDto } from './dto';
import { IRestaurantConfirmOrderResponse } from './interfaces';

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

  async sendPlaceOrderEvent(order: Order) {
    this.notificationServiceClient.emit('orderPlacedEvent', order);
  }

  async sendConfirmOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderConfirmedByRestaurantEvent',
      order,
    );

    this.deliveryServiceClient.emit('orderConfirmedByRestaurantEvent', order);
  }

  async restaurantConfirmOrder(
    restaurantConfirmOrderDto: RestaurantConfirmOrderDto,
  ): Promise<IRestaurantConfirmOrderResponse> {
    const {
      orderId,
      cashierId = null,
      restaurantId = '',
    } = restaurantConfirmOrderDto;

    const order = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .where('order.id = :orderId', {
        orderId: orderId,
      })
      .andWhere('order.restaurantId = :restaurantId', {
        restaurantId: restaurantId,
      })
      .getOne();

    if (!order) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Order not found',
      };
    }

    if (order.delivery?.status != DeliveryStatus.DRAFT) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message:
          'Cannot confirm order. Delivery status not valid to confirm order',
      };
    }

    order.cashierId = cashierId;
    order.delivery.status = DeliveryStatus.ASSIGNING_DRIVER;
    await this.deliveryRepository.save(order.delivery);

    this.sendConfirmOrderEvent(order);
    return {
      status: HttpStatus.OK,
      message: 'Confirm order successfully',
    };
  }
}

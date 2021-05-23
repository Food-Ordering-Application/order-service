import { DeliveryStatus, OrdStatus } from 'src/order/enums';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { DELIVERY_SERVICE, NOTIFICATION_SERVICE } from 'src/constants';
import { Delivery, Order, Payment } from 'src/order/entities';
import { Repository } from 'typeorm';
import {
  DriverPickedUpOrderDto,
  RestaurantConfirmOrderDto,
  UpdateDriverForOrderEventPayload,
} from './dto';
import {
  IDriverPickedUpOrderResponse,
  IRestaurantConfirmOrderResponse,
} from './interfaces';

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

  private readonly logger = new Logger('OrderFulfillmentService');

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

  async sendDriverAcceptOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderHasBeenAssignedToDriverEvent',
      order,
    );
  }

  async sendDriverPickUpOrderEvent(order: Order) {
    this.notificationServiceClient.emit('orderHasBeenPickedUpEvent', order);
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
    await Promise.all([
      this.orderRepository.save(order),
      this.deliveryRepository.save(order.delivery),
    ]);

    this.sendConfirmOrderEvent(order);
    return {
      status: HttpStatus.OK,
      message: 'Confirm order successfully',
    };
  }

  async handleUpdateDriverForOrder(
    updateDriverForOrderEventPayload: UpdateDriverForOrderEventPayload,
  ) {
    const { orderId, driverId } = updateDriverForOrderEventPayload;

    const order = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .where('order.id = :orderId', {
        orderId: orderId,
      })
      .getOne();

    if (!order) {
      this.logger.error(`Order: ${orderId} not found`);
    }

    if (!order) {
      this.logger.error(`Order: ${orderId} not found`);
    }

    if (order.delivery?.status != DeliveryStatus.ASSIGNING_DRIVER) {
      this.logger.error(
        `Order: ${orderId} delivery status is not ${DeliveryStatus.ASSIGNING_DRIVER}`,
      );
    }

    order.delivery.driverId = driverId;
    order.delivery.status = DeliveryStatus.ON_GOING;
    await this.deliveryRepository.save(order.delivery);

    this.sendDriverAcceptOrderEvent(order);
  }

  async driverPickedUpOrder(
    driverPickedUpOrderDto: DriverPickedUpOrderDto,
  ): Promise<IDriverPickedUpOrderResponse> {
    const { orderId } = driverPickedUpOrderDto;

    const order = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .where('order.id = :orderId', {
        orderId: orderId,
      })
      .getOne();

    if (!order) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Order not found',
      };
    }

    if (order.delivery?.status != DeliveryStatus.ON_GOING) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message:
          'Cannot confirm picked up order. Delivery status not valid to picked up order',
      };
    }

    order.delivery.status = DeliveryStatus.PICKED_UP;
    await this.deliveryRepository.save(order.delivery);

    this.sendDriverPickUpOrderEvent(order);
    return {
      status: HttpStatus.OK,
      message: 'Confirm picked up order successfully',
    };
  }
}

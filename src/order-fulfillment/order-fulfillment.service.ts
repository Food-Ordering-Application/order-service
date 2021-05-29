import {
  DeliveryStatus,
  InvoiceStatus,
  OrdStatus,
  PaymentStatus,
  PaymentMethod,
} from 'src/order/enums';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DELIVERY_SERVICE,
  NOTIFICATION_SERVICE,
  USER_SERVICE,
} from 'src/constants';
import { Delivery, Invoice, Order, Payment } from 'src/order/entities';
import { Repository } from 'typeorm';
import {
  DriverCompleteOrderDto,
  DriverPickedUpOrderDto,
  RestaurantConfirmOrderDto,
  UpdateDriverForOrderEventPayload,
} from './dto';
import {
  IDriverCompleteOrderResponse,
  IDriverPickedUpOrderResponse,
  IRestaurantConfirmOrderResponse,
} from './interfaces';
import { allowed, filteredOrder } from '../shared/filteredOrder';
@Injectable()
export class OrderFulfillmentService {
  constructor(
    // repositories
    @InjectRepository(Delivery)
    private deliveryRepository: Repository<Delivery>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,

    // queues
    @Inject(NOTIFICATION_SERVICE)
    private notificationServiceClient: ClientProxy,
    @Inject(DELIVERY_SERVICE)
    private deliveryServiceClient: ClientProxy,
    @Inject(USER_SERVICE)
    private userServiceClient: ClientProxy,
  ) {}

  private readonly logger = new Logger('OrderFulfillmentService');

  async sendPlaceOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderPlacedEvent',
      filteredOrder(order, allowed),
    );
    this.logger.log(order.id, 'noti: orderPlacedEvent');
  }

  async sendConfirmOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderConfirmedByRestaurantEvent',
      order,
    );

    this.deliveryServiceClient.emit('orderConfirmedByRestaurantEvent', order);
    this.logger.log(order.id, 'noti: orderConfirmedByRestaurantEvent');
  }

  async sendDriverAcceptOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderHasBeenAssignedToDriverEvent',
      order,
    );
    this.userServiceClient.emit('orderHasBeenAssignedToDriverEvent', order);
    this.logger.log(order, 'noti: orderHasBeenAssignedToDriverEvent');
  }

  async sendDriverPickUpOrderEvent(order: Order) {
    this.notificationServiceClient.emit('orderHasBeenPickedUpEvent', order);
    this.logger.log(order.id, 'noti: orderHasBeenPickedUpEvent');
  }

  async sendDriverCompleteOrderEvent(order: Order) {
    this.notificationServiceClient.emit('orderHasBeenCompletedEvent', order);
    this.userServiceClient.emit('orderHasBeenCompletedEvent', order);
    this.logger.log(order.id, 'noti: orderHasBeenCompletedEvent');
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
      // .andWhere('order.restaurantId = :restaurantId', {
      //   restaurantId: restaurantId,
      // })
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
      .leftJoinAndSelect('order.invoice', 'invoice')
      .leftJoinAndSelect('invoice.payment', 'payment')
      .leftJoinAndSelect('payment.paypalPayment', 'paypalPayment')
      .where('order.id = :orderId', {
        orderId: orderId,
      })
      .getOne();

    if (!order) {
      this.logger.error(`Order: ${orderId} not found`);
      return;
    }

    if (order.delivery?.status != DeliveryStatus.ASSIGNING_DRIVER) {
      this.logger.error(
        `Order: ${orderId} delivery status is not ${DeliveryStatus.ASSIGNING_DRIVER}`,
      );
      return;
    }

    order.delivery.driverId = driverId;
    order.delivery.status = DeliveryStatus.ON_GOING;
    await this.deliveryRepository.save(order.delivery);

    console.dir(order, { depth: 3 });

    this.sendDriverAcceptOrderEvent(order);
  }

  async driverPickedUpOrder(
    driverPickedUpOrderDto: DriverPickedUpOrderDto,
  ): Promise<IDriverPickedUpOrderResponse> {
    const { orderId, driverId } = driverPickedUpOrderDto;

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

    if (order.delivery.driverId != driverId) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'You cannot pick up another order',
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

  async driverCompleteOrder(
    driverCompleteOrderDto: DriverCompleteOrderDto,
  ): Promise<IDriverCompleteOrderResponse> {
    const { orderId, driverId } = driverCompleteOrderDto;

    const order = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .leftJoinAndSelect('order.invoice', 'invoice')
      .leftJoinAndSelect('invoice.payment', 'payment')
      .leftJoinAndSelect('payment.paypalPayment', 'paypalPayment')
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

    if (order.delivery.driverId != driverId) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'You cannot pick up another order',
      };
    }

    if (order.delivery?.status != DeliveryStatus.PICKED_UP) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message:
          'Cannot confirm complete order. Delivery status not valid to complete order',
      };
    }

    const promises: Promise<any>[] = [];

    // update payment
    if (order.invoice.payment.method == PaymentMethod.COD) {
      order.invoice.payment.status = PaymentStatus.COMPLETED;
      order.invoice.status = InvoiceStatus.PAID;
      promises.push(
        this.paymentRepository.save(order.invoice.payment),
        this.invoiceRepository.save(order.invoice),
      );
    }

    // update delivery
    order.delivery.status = DeliveryStatus.COMPLETED;
    order.delivery.deliveredAt = new Date();
    // update order
    order.status = OrdStatus.COMPLETED;

    await Promise.all([
      this.deliveryRepository.save(order.delivery),
      this.orderRepository.save(order),
      ...promises,
    ]);

    console.dir(order, { depth: 3 });

    this.sendDriverCompleteOrderEvent(order);
    return {
      status: HttpStatus.OK,
      message: 'Confirm complete order successfully',
    };
  }
}

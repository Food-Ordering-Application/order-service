import { PaypalPayment } from './../order/entities/paypal-payment.entity';
import { DeliveryIssue } from './../order/enums/delivery-issue.enum';
import { OrderItem } from './../order/entities/order-item.entity';
import {
  DeliveryStatus,
  InvoiceStatus,
  OrdStatus,
  PaymentStatus,
  PaymentMethod,
  State,
  PayPalRefundStatus,
} from 'src/order/enums';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectConnection, InjectRepository } from '@nestjs/typeorm';
import {
  DELIVERY_SERVICE,
  NOTIFICATION_SERVICE,
  USER_SERVICE,
} from 'src/constants';
import { Delivery, Invoice, Order, Payment } from 'src/order/entities';
import { Connection, In, Repository, QueryRunner } from 'typeorm';
import {
  DriverCompleteOrderDto,
  DriverPickedUpOrderDto,
  RestaurantConfirmOrderDto,
  RestaurantFinishOrderDto,
  RestaurantVoidOrderDto,
  UpdateDriverForOrderEventPayload,
} from './dto';
import {
  IDriverCompleteOrderResponse,
  IDriverPickedUpOrderResponse,
  IRestaurantConfirmOrderResponse,
  IRestaurantFinishOrderResponse,
  IRestaurantVoidOrderResponse,
} from './interfaces';
import { PayPalClient } from './helpers/paypal-refund-helper';

import { allowed, filteredOrder } from '../shared/filteredOrder';
import { OrderEventPayload } from './events/dispatch-driver-order.event';
import { RestaurantCancelReason } from './enums';
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
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectConnection()
    private connection: Connection,

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
    console.log('EMIT orderPlacedEvent');
    this.notificationServiceClient.emit(
      'orderPlacedEvent',
      filteredOrder(order, allowed),
    );
    console.log('EMIT PLACEORDER OK');
    this.logger.log(order.id, 'noti: orderPlacedEvent');
  }

  async sendConfirmOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderConfirmedByRestaurantEvent',
      filteredOrder(order, allowed),
    );
    const payload = OrderEventPayload.toPayload(
      !!order?.invoice?.payment?.method
        ? order
        : await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.delivery', 'delivery')
            .leftJoinAndSelect('order.invoice', 'invoice')
            .leftJoinAndSelect('invoice.payment', 'payment')
            .where('order.id = :orderId', {
              orderId: order.id,
            })
            // .andWhere('order.restaurantId = :restaurantId', {
            //   restaurantId: restaurantId,
            // })
            .select([
              'order.id',
              'order.restaurantId',
              'order.cashierId',
              'order.status',
              'order.subTotal',
              'order.grandTotal',
              'delivery',
              'invoice.id',
              'payment.method',
            ])
            .getOne(),
    );
    console.log('EMIT orderConfirmedByRestaurantEvent');
    this.deliveryServiceClient.emit('orderConfirmedByRestaurantEvent', payload);
    console.log('EMIT orderConfirmedByRestaurantEvent OK');
    this.logger.log(order.id, 'noti: orderConfirmedByRestaurantEvent');
  }

  async sendOrderReadyEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderReadyEvent',
      filteredOrder(order, allowed),
    );

    this.logger.log(order.id, 'noti: orderReadyEvent');
  }

  async sendCancelOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderHasBeenCancelledEvent',
      filteredOrder(order, allowed),
    );
    this.logger.log(order.id, 'noti: orderHasBeenCancelledEvent');
  }

  async sendDriverAcceptOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderHasBeenAssignedToDriverEvent',
      filteredOrder(order, allowed),
    );
    this.userServiceClient.emit('orderHasBeenAssignedToDriverEvent', {
      driverId: order.delivery.driverId,
      paymentMethod: order.invoice.payment.method,
      shippingFee: order.delivery.shippingFee,
      orderSubtotal: order.subTotal,
    });
    this.logger.log(order, 'noti: orderHasBeenAssignedToDriverEvent');
  }

  async sendDriverPickUpOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderHasBeenPickedUpEvent',
      filteredOrder(order, allowed),
    );
    this.logger.log(order.id, 'noti: orderHasBeenPickedUpEvent');
  }

  async sendDriverCompleteOrderEvent(order: Order) {
    this.notificationServiceClient.emit(
      'orderHasBeenCompletedEvent',
      filteredOrder(order, allowed),
    );

    this.userServiceClient.emit('orderHasBeenCompletedEvent', {
      paymentMethod: order.invoice.payment.method,
      orderGrandTotal: order.grandTotal,
      orderSubTotal: order.subTotal,
      driverId: order.delivery.driverId,
      orderId: order.id,
      deliveryId: order.delivery.id,
      shippingFee: order.delivery.shippingFee,
      restaurantId: order.restaurantId,
      deliveryDistance: order.delivery.totalDeliveryDistance
        ? order.delivery.totalDeliveryDistance
        : order.delivery.distance,
    });

    this.deliveryServiceClient.emit(
      'orderHasBeenCompletedEvent',
      filteredOrder(order, allowed),
    );
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
      .leftJoinAndSelect('order.invoice', 'invoice')
      .leftJoinAndSelect('invoice.payment', 'payment')
      .where('order.id = :orderId', {
        orderId: orderId,
      })
      // .andWhere('order.restaurantId = :restaurantId', {
      //   restaurantId: restaurantId,
      // })
      .select([
        'order.id',
        'order.restaurantId',
        'order.cashierId',
        'order.status',
        'order.subTotal',
        'order.grandTotal',
        'delivery',
        'invoice.id',
        'payment.method',
      ])
      .getOne();

    if (!order) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Order not found',
      };
    }

    // if (order.delivery?.status != DeliveryStatus.DRAFT) {
    //   return {
    //     status: HttpStatus.BAD_REQUEST,
    //     message:
    //       'Cannot confirm order. Delivery status not valid to confirm order',
    //   };
    // }

    order.cashierId = cashierId;
    order.status = OrdStatus.CONFIRMED;
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

  async restaurantFinishOrder(
    restaurantFinishOrderDto: RestaurantFinishOrderDto,
  ): Promise<IRestaurantFinishOrderResponse> {
    const { orderId, restaurantId } = restaurantFinishOrderDto;

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

    if (order?.status != OrdStatus.CONFIRMED) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Order need to be confirmed before finish',
      };
    }

    order.status = OrdStatus.READY;
    await this.orderRepository.save(order);
    this.sendOrderReadyEvent(order);
    return {
      status: HttpStatus.OK,
      message: 'Update order to be ready successfully',
    };
  }

  async restaurantVoidOrder(
    restaurantVoidOrderDto: RestaurantVoidOrderDto,
  ): Promise<IRestaurantVoidOrderResponse> {
    const {
      orderId,
      cashierId = null,
      restaurantId = '',
      orderItemIds = [],
      cashierNote = null,
    } = restaurantVoidOrderDto;

    const promises: (() => Promise<any>)[] = [];
    const order = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .leftJoinAndSelect('order.invoice', 'invoice')
      .leftJoinAndSelect('invoice.payment', 'payment')
      .leftJoinAndSelect('payment.paypalPayment', 'paypalPayment')
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
        message: 'Order not found in current authenticated restaurant',
      };
    }

    if (order.delivery?.status != DeliveryStatus.DRAFT) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Cannot void order. Delivery status not valid to void order',
      };
    }

    const PAYMENT_METHODS_SUPPORT_CANCEL_ORDER: string[] = [
      PaymentMethod.PAYPAL,
      PaymentMethod.COD,
    ];

    if (
      PAYMENT_METHODS_SUPPORT_CANCEL_ORDER.length &&
      !PAYMENT_METHODS_SUPPORT_CANCEL_ORDER.includes(
        order.invoice.payment.method,
      )
    ) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: `Cannot void order. ${order.invoice.payment.method} payment have not supported to cancel order`,
      };
    }

    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // update out of stock order items
    if (orderItemIds.length) {
      const orderItems = await this.orderItemRepository.find({
        id: In(orderItemIds),
        orderId: orderId,
      });

      if (orderItems.length !== orderItemIds.length) {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'One of order item ids is not valid. Please check again',
        };
      }

      const patchedOrderItems = orderItems.map((orderItem) => ({
        ...orderItem,
        state: State.OUT_OF_STOCK,
      }));

      // save order items
      const updateOrderItemsPromise = () =>
        queryRunner.manager.save(OrderItem, patchedOrderItems);
      promises.push(updateOrderItemsPromise);
    }

    // update order
    order.cashierId = cashierId;
    order.status = OrdStatus.CANCELLED;

    // -- save order
    const updateOrderPromise = () => queryRunner.manager.save(Order, order);
    promises.push(updateOrderPromise);

    // update delivery
    const delivery = order.delivery;
    if (!delivery) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error when update delivery information',
      };
    }

    const cancelReasonId =
      orderItemIds.length > 0
        ? RestaurantCancelReason.OUT_OF_STOCK
        : RestaurantCancelReason.OTHER;
    const cancelNote = cashierNote;

    delivery.status = DeliveryStatus.CANCELLED;
    delivery.issueType = DeliveryIssue.ITEM_IS_OUT_OF_STOCK;
    delivery.issueNote = cashierNote;
    delivery.cancelOrderReasonId = cancelReasonId;
    delivery.cancelNote = cancelNote;

    // -- save delivery
    const updateDeliveryPromise = () =>
      queryRunner.manager.save(Delivery, order.delivery);
    promises.push(updateDeliveryPromise);

    // update invoice
    // -- save delivery
    const invoice = order.invoice;
    const payment = invoice.payment;
    if (!invoice || !payment) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error when update invoice information',
      };
    }
    if (payment.method === PaymentMethod.COD) {
      payment.status = PaymentStatus.CANCELLED;
      invoice.status = InvoiceStatus.CANCELLED;
      const updateInvoicePromise = () =>
        queryRunner.manager.save(Invoice, invoice);
      const updatePaymentPromise = () =>
        queryRunner.manager.save(Payment, payment);
      promises.push(updateInvoicePromise, updatePaymentPromise);
    }

    if (payment.method === PaymentMethod.PAYPAL) {
      // refund PayPal
      const { paypalPayment } = payment;
      const response = await PayPalClient.refund(
        paypalPayment.captureId,
        paypalPayment.paypalMerchantId,
      );
      if (!response) {
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error during refund process',
        };
      }
      console.log({ response });

      const { refundId, status: refundStatus } = response;

      invoice.status = InvoiceStatus.REFUNDED;

      payment.status =
        refundStatus === PayPalRefundStatus.COMPLETED
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PENDING_REFUNDED;

      paypalPayment.refundId = refundId;

      const updateInvoicePromise = () =>
        queryRunner.manager.save(Invoice, invoice);
      const updatePaymentPromise = () =>
        queryRunner.manager.save(Payment, payment);
      const updatePayPalPaymentPromise = () =>
        queryRunner.manager.save(PaypalPayment, paypalPayment);

      promises.push(
        updateInvoicePromise,
        updatePaymentPromise,
        updatePayPalPaymentPromise,
      );
    }

    try {
      await Promise.all(promises.map((callback) => callback()));
      await queryRunner.commitTransaction();

      // notify user
      this.sendCancelOrderEvent(order);

      return {
        status: HttpStatus.OK,
        message: 'Void order successfully',
      };
    } catch (error) {
      console.log('void error', error.message);
      await queryRunner.rollbackTransaction();

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    } finally {
      await queryRunner.release();
    }
  }

  async handleUpdateDriverForOrder(
    updateDriverForOrderEventPayload: UpdateDriverForOrderEventPayload,
  ) {
    const { orderId, driverId, totalDistance, estimatedArrivalTime } =
      updateDriverForOrderEventPayload;

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
    order.delivery.totalDeliveryDistance = totalDistance;
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
      order.invoice.payment.status = PaymentStatus.SUCCESS;
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

import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  RequestTimeoutException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectConnection, InjectRepository } from '@nestjs/typeorm';
import * as paypal from '@paypal/checkout-server-sdk';
import axios from 'axios';
import * as CryptoJS from 'crypto-js';
import * as moment from 'moment';
import * as momenttimezone from 'moment-timezone';
import { throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import {
  Connection,
  QueryRunner,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import * as uniqid from 'uniqid';
import { client } from '../config/paypal';
import {
  NOTIFICATION_SERVICE,
  RESTAURANT_SERVICE,
  USER_SERVICE,
} from '../constants';
import { CacheService } from './../cache/cache.service';
import { OrderFulfillmentService } from './../order-fulfillment/order-fulfillment.service';
import { DEFAULT_EXCHANGE_RATE, PERCENT_PLATFORM_FEE } from './constants';
import {
  AddNewItemToOrderDto,
  ApprovePaypalOrderDto,
  ConfirmOrderCheckoutDto,
  EventPaymentZALOPAYDto,
  EventPaypalOrderOccurDto,
  GetAllRestaurantOrderDto,
  GetLastDraftOrderOfCustomerDto,
  GetListOrderOfDriverDto,
  GetOrderAssociatedWithCusAndResDto,
  GetOrderDetailDto,
  GetOrderHistoryOfCustomerDto,
  GetOrderRatingInfosDto,
  GetOrdersOfCustomerDto,
  GetOrderStatisticsOfRestaurantDto,
  GetRevenueInsightOfRestaurantDto,
  IncreaseOrderItemQuantityDto,
  ReduceOrderItemQuantityDto,
  RemoveOrderItemDto,
  RestaurantMenuInsightDto,
  RestaurantOrderStatisticsDto,
  RestaurantRevenueInsightDto,
  UpdateDeliveryAddressDto,
  UpdateOrderItemQuantityDto,
  UpdateZALOPAYPaymentStatusDto,
} from './dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetMenuInsightOfRestaurantDto } from './dto/get-menu-insight-of-restaurant.dto';
import { GetRestaurantStatisticDto } from './dto/get-restaurant-statistic.dto';
import { SavePosOrderDto } from './dto/pos-order/save-pos-order.dto';
import {
  CashPayment,
  Delivery,
  Invoice,
  Order,
  OrderItem,
  OrderItemTopping,
  Payment,
  PaypalPayment,
} from './entities';
import { DeliveryLocation } from './entities/delivery-location.entity';
import {
  DeliveryStatus,
  EDriverOrderType,
  GetRestaurantOrder,
  InvoiceStatus,
  MenuInsightSortBy,
  OrdStatus,
  PaymentMethod,
  PaymentStatus,
} from './enums';
import { createAndStoreOrderItem } from './helpers';
import {
  calculateExpectedDeliveryTime,
  calculateOrderGrandToTal,
  calculateOrderSubTotal,
  calculateShippingFee,
  findOrderItem,
  findOrderItemIndex,
  getPreparationTime,
  setPayment,
} from './helpers/order-logic.helper';
import {
  getMenuItemQuery,
  getOrderStatisticsQuery,
  getRevenueQuery,
} from './helpers/query-builder';
import {
  IApprovePaypalOrder,
  ICityAreaData,
  IConfirmOrderCheckoutResponse,
  ICreateOrderResponse,
  ICustomerOrder,
  ICustomerOrdersResponse,
  IFeedback,
  IGetOrderRatingInfosResponse,
  IIsAutoConfirmResponse,
  IOrder,
  IOrdersResponse,
  IRestaurantStatisticResponse,
  IResultZALOPAY,
  ISaveOrderResponse,
  ISimpleResponse,
} from './interfaces';

@Injectable()
export class OrderService {
  private readonly logger = new Logger('OrderService');

  constructor(
    @InjectRepository(Delivery)
    private deliveryRepository: Repository<Delivery>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(OrderItemTopping)
    private orderItemToppingRepository: Repository<OrderItemTopping>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private orderFulfillmentService: OrderFulfillmentService,
    @InjectRepository(PaypalPayment)
    private paypalPaymentRepository: Repository<PaypalPayment>,
    @InjectRepository(CashPayment)
    private cashPaymentRepository: Repository<CashPayment>,
    @InjectRepository(DeliveryLocation)
    private deliveryLocationRepository: Repository<DeliveryLocation>,
    @InjectConnection()
    private connection: Connection,
    @Inject(USER_SERVICE)
    private userServiceClient: ClientProxy,
    @Inject(RESTAURANT_SERVICE)
    private restaurantServiceClient: ClientProxy,
    @Inject(NOTIFICATION_SERVICE)
    private notificationServiceClient: ClientProxy,

    private cacheService: CacheService,
  ) {}

  async createOrderAndFirstOrderItem(
    createOrderDto: CreateOrderDto,
  ): Promise<ICreateOrderResponse> {
    let queryRunner;
    try {
      const { orderItem, restaurant, customer, cashierId } = createOrderDto;
      const {
        restaurantId,
        restaurantGeom,
        restaurantAddress,
        restaurantName = null,
        restaurantPhoneNumber = null,
      } = restaurant;
      const {
        customerId = null,
        customerGeom = null,
        customerAddress = null,
        customerName = null,
        customerPhoneNumber = null,
      } = customer || {};

      // TODO: make this a transaction
      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      // Ta??o va?? l??u orderItem
      const { addOrderItems, totalPriceToppings } =
        await createAndStoreOrderItem(orderItem, queryRunner);
      // Ta??o va?? l??u order
      const order = new Order();
      order.restaurantId = restaurantId;
      order.status = OrdStatus.DRAFT;
      order.orderItems = addOrderItems;
      order.subTotal =
        (orderItem.price + totalPriceToppings) * orderItem.quantity;

      if (!customerId) {
        // N????u la?? order b??n POS thi?? co?? cashierId
        order.cashierId = cashierId;
        order.grandTotal = calculateOrderGrandToTal(order);
        await queryRunner.manager.save(Order, order);
        return {
          status: HttpStatus.CREATED,
          message: 'Order created successfully',
          order: order,
        };
      }
      // N????u la?? order b??n salechannel thi?? co?? customerId
      // Ta??o va?? l??u delivery
      const delivery = new Delivery();
      order.delivery = delivery;
      await queryRunner.manager.save(Order, order);
      delivery.order = order;
      delivery.status = DeliveryStatus.DRAFT;

      // add customer information
      delivery.customerId = customerId;
      delivery.customerName = customerName;
      delivery.customerPhoneNumber = customerPhoneNumber;

      // add restaurant information
      delivery.restaurantGeom = restaurantGeom;
      delivery.restaurantAddress = restaurantAddress;
      delivery.restaurantName = restaurantName;
      delivery.restaurantPhoneNumber = restaurantPhoneNumber;

      /* N????u customer co?? ??i??a chi?? */
      if (customerGeom) {
        this.handleCustomerAddressChange(order, {
          address: customerAddress,
          geo: customerGeom,
        });
      }
      await Promise.all([
        queryRunner.manager.save(Delivery, delivery),
        queryRunner.manager.save(Order, order),
      ]);
      console.log('Order', order);
      delete delivery.order;
      const newOrder = { ...order, delivery: delivery };
      await queryRunner.commitTransaction();
      return {
        status: HttpStatus.CREATED,
        message: 'Order created successfully',
        order: newOrder,
      };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      console.log('Error in createOrder');

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async getOrderAssociatedWithCusAndRes(
    getOrderAssociatedWithCusAndResDto: GetOrderAssociatedWithCusAndResDto,
  ): Promise<ICreateOrderResponse> {
    try {
      const { customerId, restaurantId } = getOrderAssociatedWithCusAndResDto;
      //TODO: L????y ra order DRAFT cu??a customer ??????i v????i nha?? ha??ng cu?? th????
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where(
          'order.restaurantId = :restaurantId AND delivery.customerId = :customerId',
          {
            restaurantId: restaurantId,
            customerId: customerId,
          },
        )
        .andWhere('order.status = :orderStatus', {
          orderStatus: OrdStatus.DRAFT,
        })
        .getOne();
      return {
        status: HttpStatus.OK,
        message: 'Draft order fetched successfully',
        order,
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    }
  }

  async addNewItemToOrder(
    addNewItemToOrderDto: AddNewItemToOrderDto,
  ): Promise<ICreateOrderResponse> {
    let queryRunner;
    try {
      // TODO: make this a transaction
      const { sendItem, orderId } = addNewItemToOrderDto;
      // Ti??m ra order v????i orderId
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where('order.id = :orderId', {
          orderId: orderId,
        })
        .getOne();

      if (!order) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Order not found',
          order: null,
        };
      }

      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const foundOrderItem = findOrderItem(sendItem, order.orderItems);
      const foundOrderItemIndex = findOrderItemIndex(
        sendItem,
        order.orderItems,
      );
      // N????u item g????i l??n orderItem ??a?? co?? s????n va??  gi????ng y chang topping
      // trong order thi?? t??ng s???? l??????ng orderItem ??a?? co?? s????n
      if (foundOrderItem) {
        foundOrderItem.quantity += sendItem.quantity;
        await queryRunner.manager.save(OrderItem, foundOrderItem);
        order.orderItems[foundOrderItemIndex] = foundOrderItem;
        // Ti??nh toa??n la??i gia??
        order.subTotal = calculateOrderSubTotal(order.orderItems);
      } else {
        // N????u item g????i l??n gi????ng v????i orderItem ??a?? co?? s????n nh??ng kha??c topping ho????c g????i l??n kh??ng gi????ng
        // thi?? ta??o orderItem m????i
        // Ta??o va?? l??u orderItem v????i orderItemTopping t????ng ????ng
        const { addOrderItems, totalPriceToppings } =
          await createAndStoreOrderItem(sendItem, queryRunner);

        // L??u orderItem m????i va??o order
        order.orderItems = [...order.orderItems, ...addOrderItems];
        // Ti??nh toa??n la??i gia?? va?? l??u la??i order
        const totalOrderItemPrice =
          (sendItem.price + totalPriceToppings) * sendItem.quantity;
        order.subTotal += totalOrderItemPrice;
      }
      order.grandTotal = calculateOrderGrandToTal(order);
      // L??u la??i order
      await queryRunner.manager.save(Order, order);
      await queryRunner.commitTransaction();
      return {
        status: HttpStatus.OK,
        message: 'New orderItem added successfully',
        order,
      };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async reduceOrderItemQuantity(
    reduceOrderItemQuantityDto: ReduceOrderItemQuantityDto,
  ): Promise<ICreateOrderResponse> {
    let queryRunner;
    try {
      let flag = 0;
      const { orderId, orderItemId } = reduceOrderItemQuantityDto;
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where('order.id = :orderId', {
          orderId: orderId,
        })
        .getOne();

      if (!order) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Order not found',
          order: null,
        };
      }

      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Ti??m ra orderitem ??o?? va?? s????a la??i quantity
      const orderItem = order.orderItems.find(
        (item) => item.id === orderItemId,
      );

      orderItem.quantity -= 1;
      // N????u quantity la?? 0 thi?? xo??a orderItem kho??i order
      if (orderItem.quantity < 1) {
        const newOrderItems = order.orderItems.filter(
          (ordItem) => ordItem.id !== orderItem.id,
        );
        order.orderItems = newOrderItems;
        // Remove h????t t????t ca?? orderItemTopping cu??a orderItem ??o??
        await queryRunner.manager.remove(
          OrderItemTopping,
          orderItem.orderItemToppings,
        );
        if (newOrderItems.length === 0) {
          flag = 1;
          await queryRunner.manager.remove(OrderItem, orderItem);
          if (order.delivery) {
            await queryRunner.manager.remove(Delivery, order.delivery);
          }
          await queryRunner.manager.remove(Order, order);
        } else {
          order.subTotal = calculateOrderSubTotal(order.orderItems);
          order.grandTotal = calculateOrderGrandToTal(order);
          await Promise.all([
            queryRunner.manager.save(Order, order),
            queryRunner.manager.remove(OrderItem, orderItem),
          ]);
        }
      } else {
        const orderItemIndex = order.orderItems.findIndex(
          (item) => item.id === orderItemId,
        );
        order.orderItems[orderItemIndex] = orderItem;
        order.subTotal = calculateOrderSubTotal(order.orderItems);
        order.grandTotal = calculateOrderGrandToTal(order);
        await Promise.all([
          queryRunner.manager.save(OrderItem, orderItem),
          queryRunner.manager.save(Order, order),
        ]);
      }
      await queryRunner.commitTransaction();
      if (flag === 1) {
        return {
          status: HttpStatus.OK,
          message: 'Reduce orderItem quantity successfully',
          order: null,
        };
      }
      return {
        status: HttpStatus.OK,
        message: 'Reduce orderItem quantity successfully',
        order,
      };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async increaseOrderItemQuantity(
    increaseOrderItemQuantityDto: IncreaseOrderItemQuantityDto,
  ): Promise<ICreateOrderResponse> {
    let queryRunner;
    try {
      const { orderId, orderItemId } = increaseOrderItemQuantityDto;
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where('order.id = :orderId', {
          orderId: orderId,
        })
        .getOne();
      // Ti??m ra orderitem ??o?? va?? s????a la??i quantity
      const orderItem = order.orderItems.find(
        (item) => item.id === orderItemId,
      );
      orderItem.quantity += 1;
      const orderItemIndex = order.orderItems.findIndex(
        (item) => item.id === orderItemId,
      );
      order.orderItems[orderItemIndex] = orderItem;
      order.subTotal = calculateOrderSubTotal(order.orderItems);
      order.grandTotal = calculateOrderGrandToTal(order);

      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      await Promise.all([
        queryRunner.manager.save(OrderItem, orderItem),
        queryRunner.manager.save(Order, order),
      ]);
      await queryRunner.commitTransaction();
      return {
        status: HttpStatus.OK,
        message: 'Increase orderItem quantity successfully',
        order,
      };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async removeOrderItem(
    removeOrderItemDto: RemoveOrderItemDto,
  ): Promise<ICreateOrderResponse> {
    let queryRunner;
    try {
      // TODO: make this a transaction
      const { orderItemId, orderId } = removeOrderItemDto;
      // Ti??m la??i order v????i orderId
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where('order.id = :orderId', {
          orderId: orderId,
        })
        .getOne();

      if (!order) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Order not found',
          order: null,
        };
      }

      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const orderItemToDelete = order.orderItems.find(
        (ordItem) => ordItem.id === orderItemId,
      );
      // Xo??a ca??c orderItemTopping cu??a orderItem ??o?? n????u co??
      await queryRunner.manager.remove(
        OrderItemTopping,
        orderItemToDelete.orderItemToppings,
      );
      // Xo??a orderItem ??o?? trong order.orderItems tra?? v???? ng??????i du??ng
      order.orderItems = order.orderItems.filter(
        (ordItem) => ordItem.id !== orderItemId,
      );
      // Xo??a orderItem ??o??
      await queryRunner.manager.remove(OrderItem, orderItemToDelete);

      let flag = 0;

      // N????u nh?? order kh??ng co??n orderItem na??o thi?? xo??a order
      if (order.orderItems.length === 0) {
        flag = 1;
        if (order.delivery) {
          await queryRunner.manager.remove(Delivery, order.delivery);
        }
        await queryRunner.manager.remove(Order, order);
      } else {
        // Ti??nh toa??n la??i gia??
        order.subTotal = calculateOrderSubTotal(order.orderItems);
        order.grandTotal = calculateOrderGrandToTal(order);
        await Promise.all([queryRunner.manager.save(Order, order)]);
      }
      await queryRunner.commitTransaction();
      if (flag) {
        return {
          status: HttpStatus.OK,
          message: 'OrderItem removed successfully',
          order: null,
        };
      }
      return {
        status: HttpStatus.OK,
        message: 'OrderItem removed successfully',
        order,
      };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async getOrdersOfRestaurant(
    getAllRestaurantOrderDto: GetAllRestaurantOrderDto,
  ): Promise<IOrdersResponse> {
    const {
      restaurantId,
      query,
      pageNumber,
      start: from,
      end: to,
      orderStatus = null,
    } = getAllRestaurantOrderDto;
    try {
      let orderQueryBuilder: SelectQueryBuilder<Order> = this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .where('order.restaurantId = :restaurantId', {
          restaurantId: restaurantId,
        });

      if (orderStatus) {
        orderQueryBuilder = orderQueryBuilder.andWhere(
          'order.status = :orderStatus',
          {
            orderStatus: orderStatus,
          },
        );
      }

      if (from && to) {
        const fromDate = momenttimezone
          .tz(from, 'Asia/Ho_Chi_Minh')
          .utc()
          .format();
        const toDate = momenttimezone.tz(to, 'Asia/Ho_Chi_Minh').utc().format();
        orderQueryBuilder = orderQueryBuilder
          .andWhere('order.createdAt >= :startDate', {
            startDate: fromDate,
          })
          .andWhere('order.createdAt <= :endDate', {
            endDate: toDate,
          });
      }

      if (query === GetRestaurantOrder.POS) {
        orderQueryBuilder = orderQueryBuilder.andWhere('delivery.id IS NULL');
      }

      if (query === GetRestaurantOrder.SALE) {
        orderQueryBuilder = orderQueryBuilder.andWhere(
          'delivery.id IS NOT NULL',
        );
      }

      const orders = await orderQueryBuilder
        .skip((pageNumber - 1) * 25)
        .take(25)
        .select(['order', 'ordItems.id', 'ordItems.quantity', 'delivery'])
        .getMany();

      return {
        status: HttpStatus.OK,
        message: 'Fetch orders of restaurant successfully',
        orders: orders,
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        orders: null,
      };
    }
  }

  async getOrderDetail(
    getOrderDetailDto: GetOrderDetailDto,
  ): Promise<ICreateOrderResponse> {
    try {
      const { orderId } = getOrderDetailDto;
      // Ti??m la??i order v????i orderId

      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.invoice', 'invoice')
        .leftJoinAndSelect('invoice.payment', 'payment')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where('order.id = :orderId', {
          orderId: orderId,
        })
        .select([
          'order',
          'delivery',
          'invoice.status',
          'payment.amount',
          'payment.method',
          'payment.status',
          'ordItems',
          'ordItemToppings',
        ])
        .getOne();

      if (!order) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Order not found',
          order: null,
        };
      }

      if (order?.status !== OrdStatus.COMPLETED) {
        return {
          status: HttpStatus.OK,
          message: 'Order fetched successfully',
          order,
        };
      }

      const feedbacks = await this.getFeedbackOfOrders([orderId]);
      const feedback: IFeedback =
        Array.isArray(feedbacks) && feedbacks.length ? feedbacks[0] : null;

      return {
        status: HttpStatus.OK,
        message: 'Order fetched successfully',
        order: { ...order, feedback },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    }
  }

  async updateOrderItemQuantity(
    updateOrderItemQuantityDto: UpdateOrderItemQuantityDto,
  ): Promise<ICreateOrderResponse> {
    let queryRunner;
    try {
      let flag = 0;
      // TODO: make this a transaction
      const { orderId, orderItemId, quantity } = updateOrderItemQuantityDto;
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where('order.id = :orderId', {
          orderId: orderId,
        })
        .getOne();

      if (!order) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Order not found',
          order: null,
        };
      }

      // Ti??m ra orderitem ??o?? va?? s????a la??i quantity
      const orderItem = order.orderItems.find(
        (item) => item.id === orderItemId,
      );

      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      orderItem.quantity = quantity;
      // N????u quantity la?? 0 thi?? xo??a orderItem kho??i order
      if (orderItem.quantity < 1) {
        const newOrderItems = order.orderItems.filter(
          (ordItem) => ordItem.id !== orderItem.id,
        );
        order.orderItems = newOrderItems;
        // Remove h????t t????t ca?? orderItemTopping cu??a orderItem ??o??
        await queryRunner.manager.remove(
          OrderItemTopping,
          orderItem.orderItemToppings,
        );
        if (newOrderItems.length === 0) {
          flag = 1;
          await queryRunner.manager.remove(OrderItem, orderItem);
          if (order.delivery) {
            await queryRunner.manager.remove(Delivery, order.delivery);
          }
          await queryRunner.manager.remove(Order, order);
        } else {
          order.subTotal = calculateOrderSubTotal(order.orderItems);
          order.grandTotal = calculateOrderGrandToTal(order);
          await Promise.all([
            queryRunner.manager.save(Order, order),
            queryRunner.manager.remove(OrderItem, orderItem),
          ]);
        }
      } else {
        const orderItemIndex = order.orderItems.findIndex(
          (item) => item.id === orderItemId,
        );
        order.orderItems[orderItemIndex] = orderItem;
        order.subTotal = calculateOrderSubTotal(order.orderItems);
        order.grandTotal = calculateOrderGrandToTal(order);
        await Promise.all([
          queryRunner.manager.save(OrderItem, orderItem),
          queryRunner.manager.save(Order, order),
        ]);
      }
      await queryRunner.commitTransaction();
      if (flag === 1) {
        return {
          status: HttpStatus.OK,
          message:
            'Due to no orderItem left in order, order have been deleted!',
          order: null,
        };
      }
      return {
        status: HttpStatus.OK,
        message: 'Update orderItem quantity successfully',
        order,
      };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async updateDeliveryAddress(
    updateDeliveryAddressDto: UpdateDeliveryAddressDto,
  ): Promise<ICreateOrderResponse> {
    try {
      const {
        orderId,
        newAddress: { address, geom },
      } = updateDeliveryAddressDto;
      //TODO: Ti??m ra order v????i orderId
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where('order.id = :orderId', {
          orderId: orderId,
        })
        .getOne();

      if (!order) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Order not found',
          order: null,
        };
      }

      this.handleCustomerAddressChange(order, { address: address, geo: geom });

      await Promise.all([
        this.deliveryRepository.save(order.delivery),
        this.orderRepository.save(order),
      ]);

      return {
        status: HttpStatus.OK,
        message: 'Update delivery address successfully',
        order,
      };
    } catch (error) {
      this.logger.error(error);

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    }
  }

  handleCustomerAddressChange(
    order: Order,
    newCustomerLocation: {
      address: string;
      geo: { type: string; coordinates: number[] };
    },
  ) {
    // calculate new shipping fee
    const { distance, shippingFee } = calculateShippingFee(
      order.delivery.restaurantGeom,
      newCustomerLocation.geo,
    );
    // update new location
    order.delivery.customerAddress = newCustomerLocation.address;
    order.delivery.customerGeom = newCustomerLocation.geo;

    // update delivery fee, distance and order grandTotal
    order.delivery.shippingFee = shippingFee;
    order.delivery.distance = Math.floor(distance);
    // calculate expected delivery time
    const preparationTime = getPreparationTime(order);
    order.delivery.expectedDeliveryTime = calculateExpectedDeliveryTime(
      new Date(),
      preparationTime,
      distance,
    );

    order.grandTotal = calculateOrderGrandToTal(order);
  }

  async confirmOrderCheckout(
    confirmOrderCheckoutDto: ConfirmOrderCheckoutDto,
  ): Promise<IConfirmOrderCheckoutResponse> {
    let queryRunner;
    try {
      console.log('CONFIRM ORDER CHECKOUT FUNCTION');
      const { paymentMethod, orderId, customerId, paypalMerchantId } =
        confirmOrderCheckoutDto;
      let { note } = confirmOrderCheckoutDto;
      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      //TODO: L????y th??ng tin order

      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.deliveryLocation', 'deliveryLocation')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
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

      //TODO: N????u la?? order salechannel
      if (order.delivery) {
        //TODO: N????u order ??o?? ko pha??i do customer ta??o order ??o?? checkout (Authorization)
        if (order.delivery.customerId !== customerId) {
          return {
            status: HttpStatus.FORBIDDEN,
            message: 'Forbidden',
          };
        }
        order.createdAt = new Date();
      }
      //TODO: Th??m note cho order n????u co??
      if (note) {
        note = note.trim();
        order.note = note;
      }

      //TODO: L???y th??ng tin city v?? area n??i ng?????i d??ng ?????t
      const promises: (() => Promise<any>)[] = [];
      //TODO: N????u order ch??a co?? invoice (Tr??????ng h????p l????n ??????u ????n ??????t ha??ng)
      let invoice: Invoice;
      let cityDataIndex = 2;
      let isAutoConfirmDataIndex = 0;
      if (!order?.invoice) {
        console.log('NOT HAVING INVOICE');
        invoice = new Invoice();
        invoice.order = order;
        invoice.status = InvoiceStatus.UNPAID;
        invoice.invoiceNumber = uniqid('invoice-');
        order.invoice = invoice;
        //* Save invoice promise
        const saveInvoicePromise = () =>
          queryRunner.manager.save(Invoice, invoice);
        promises.push(saveInvoicePromise);
        cityDataIndex = 3;
        isAutoConfirmDataIndex = 1;
      }

      //* getIsAutoConfirmPromise, saveOrderPromise,  getCityFromLocationPromise
      const getIsAutoConfirmPromise = () =>
        this.userServiceClient
          .send('getIsAutoConfirm', { restaurantId: order.restaurantId })
          .pipe(
            timeout(5000),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                return throwError(
                  new RequestTimeoutException(
                    'Internal timeout User server has problem!',
                  ),
                );
              }
              return throwError({ message: err });
            }),
          )
          .toPromise();

      const saveOrderPromise = () => queryRunner.manager.save(Order, order);

      const getCityFromLocationPromise = () =>
        this.restaurantServiceClient
          .send('getCityFromLocation', {
            position: {
              latitude: order.delivery.customerGeom.coordinates[1],
              longitude: order.delivery.customerGeom.coordinates[0],
            },
          })
          .pipe(
            timeout(5000),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                return throwError(
                  new RequestTimeoutException(
                    'Internal timeout Restaurant server has problem!',
                  ),
                );
              }
              return throwError({ message: err });
            }),
          )
          .toPromise();

      promises.push(
        getIsAutoConfirmPromise,
        saveOrderPromise,
        getCityFromLocationPromise,
      );

      const values = await Promise.all(promises.map((callback) => callback()));
      console.log('values[cityDataIndex]', values[cityDataIndex]);
      //TODO: N????u kh??ng co?? d???? li????u city va?? area
      if (!values[cityDataIndex].data.city) {
        throw new Error(
          'Cannot find city and area information from customer lat and long',
        );
      }
      console.log('here');
      //TODO: N????u order ch??a l??u deliveryLocation
      const promises2: (() => Promise<any>)[] = [];
      let deliveryLocation;
      if (!order?.deliveryLocation) {
        console.log('NOT HAVING DELIVERY LOCATION');
        deliveryLocation = new DeliveryLocation();
        deliveryLocation.cityId = values[cityDataIndex].data.city.id;
        deliveryLocation.cityName = values[cityDataIndex].data.city.name;
        deliveryLocation.areaId =
          values[cityDataIndex].data.city.districts[0].id;
        deliveryLocation.areaName =
          values[cityDataIndex].data.city.districts[0].name;
        deliveryLocation.order = order;
        //* Create deliveryLocation promise
        const createDeliveryLocationPromise = () =>
          queryRunner.manager.save(DeliveryLocation, deliveryLocation);
        promises2.push(createDeliveryLocationPromise);
      } else {
        //TODO: Tr??????ng h????p ??????t ha??ng Paypal v?? webview xong ????n thoa??t r????i ??????t la??i
        //TODO: N????u co?? r????i thi?? update la??i
        console.log('ALREADY HAVE DELIVERY LOCATION');
        order.deliveryLocation.cityId = values[cityDataIndex].data.city.id;
        order.deliveryLocation.cityName = values[cityDataIndex].data.city.name;
        order.deliveryLocation.areaId =
          values[cityDataIndex].data.city.districts[0].id;
        order.deliveryLocation.areaName =
          values[cityDataIndex].data.city.districts[0].name;
        //* Update deliveryLocation promise
        const updateDeliveryLocationPromise = () =>
          queryRunner.manager.save(DeliveryLocation, order.deliveryLocation);
        promises2.push(updateDeliveryLocationPromise);
      }

      let payment: Payment;
      //TODO: N????u order ch??a l??u payment
      if (!order?.invoice?.payment) {
        console.log('NOT HAVING PAYMENT');
        //TODO: T???o v?? l??u Payment
        payment = new Payment();
        payment.amount = calculateOrderGrandToTal(order);
        payment.invoice = invoice;
        invoice.payment = payment;
        if (
          paymentMethod === PaymentMethod.PAYPAL ||
          paymentMethod === PaymentMethod.ZALOPAY
        ) {
          payment.status = PaymentStatus.PENDING_USER_ACTION;
        } else {
          payment.status = PaymentStatus.PROCESSING;
        }
        payment.method = paymentMethod;
        //* Create payment promise
        const createPaymentPromise = () =>
          queryRunner.manager.save(Payment, payment);
        promises2.push(createPaymentPromise);
      } else {
        //TODO: Tr??????ng h????p ??????t ha??ng Paypal v?? webview xong ????n thoa??t r????i ??????t la??i
        //TODO: N????u co?? r????i thi?? update la??i
        console.log('ALREADY HAVE PAYMENT');
        order.invoice.payment.amount = calculateOrderGrandToTal(order);
        order.invoice.payment.invoice = invoice;
        if (
          paymentMethod === PaymentMethod.PAYPAL ||
          paymentMethod === PaymentMethod.ZALOPAY
        ) {
          order.invoice.payment.status = PaymentStatus.PENDING_USER_ACTION;
        } else {
          order.invoice.payment.status = PaymentStatus.PROCESSING;
        }
        order.invoice.payment.method = paymentMethod;
        //* Update payment promise
        const updatePaymentPromise = () =>
          queryRunner.manager.save(Payment, order.invoice.payment);
        promises2.push(updatePaymentPromise);
      }

      await Promise.all(promises2.map((callback) => callback()));
      if (deliveryLocation) {
        order.deliveryLocation = deliveryLocation;
      }

      console.log('BEFORE SWITCH');
      const { status, isAutoConfirm } = values[isAutoConfirmDataIndex];
      const isMerchantNotAvailable =
        status === HttpStatus.NOT_FOUND ||
        isAutoConfirm === undefined ||
        isAutoConfirm === null;
      const doesConfirmOrder = isAutoConfirm || isMerchantNotAvailable;
      switch (paymentMethod) {
        case PaymentMethod.COD:
          console.log('BEGIN COD');
          const promises3: (() => Promise<any>)[] = [];

          //TODO: N????u co?? l??u paypalPayment thi?? xo??a
          if (order?.invoice?.payment?.paypalPayment) {
            //* Remove paypalPayment promise
            const removePaypalPayment = () =>
              queryRunner.manager.remove(
                PaypalPayment,
                order.invoice.payment.paypalPayment,
              );
            promises3.push(removePaypalPayment);
          }

          console.log('isAutoConfirm', isAutoConfirm);
          console.log('isMerchantNotAvailable', isMerchantNotAvailable);
          if (doesConfirmOrder) {
            console.log('AUTOCONFIRM ORDER');
            //* handleAutoConfirmOrder promise
            const handleAutoConfirmOrderPromise = () =>
              this.handleAutoConfirmOrder(order, queryRunner);
            promises3.push(handleAutoConfirmOrderPromise);
          } else {
            console.log('PlaceOrder');
            //* placeOrder promise
            const placeOrderPromise = () => this.placeOrder(order, queryRunner);
            promises3.push(placeOrderPromise);
          }
          console.log('COD OK');
          await Promise.all(promises3.map((callback) => callback()));
          console.log('PromiseALL');
          await queryRunner.commitTransaction();
          if (doesConfirmOrder) {
            this.orderFulfillmentService.sendConfirmOrderEvent(order);
          } else {
            this.orderFulfillmentService.sendPlaceOrderEvent(order);
          }
          console.log('commit ok');
          return {
            status: HttpStatus.OK,
            message: 'Confirm order checkout successfully',
          };
        //! ZALOPAY
        case PaymentMethod.ZALOPAY:
          console.log('BEGIN ZALOPAY');
          const promise4: (() => Promise<any>)[] = [];

          //TODO: N????u co?? l??u paypalPayment thi?? xo??a
          if (order?.invoice?.payment?.paypalPayment) {
            //* Remove paypalPayment promise
            const removePaypalPayment = () =>
              queryRunner.manager.remove(
                PaypalPayment,
                order.invoice.payment.paypalPayment,
              );
            promise4.push(removePaypalPayment);
          }

          // APP INFO
          const config = {
            app_id: '2553',
            key1: 'PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL',
            key2: 'kLtgPl8HHhfvMuDHPwKfgfsY4Ydm9eIz',
            endpoint: 'https://sb-openapi.zalopay.vn/v2/create',
            callback_url: `https://apigway.herokuapp.com/order/${order.id}/payment-result`,
          };

          const embed_data = {
            redirecturl: `https://salechannel.herokuapp.com/order/${order.id}/payment-is-processing`,
            orderid: order.id,
            // bankgroup: 'ATM',
          };

          const zalopayItems = [{}];
          const transID = Math.floor(Math.random() * 1000000);
          // appid|app_trans_id|appuser|amount|apptime|embeddata|item

          const zalopayOrder = {
            app_id: config.app_id,
            app_trans_id: `${moment().format('YYMMDD')}_${transID}`, // translation missing: vi.docs.shared.sample_code.comments.app_trans_id
            app_user: 'user123' + Math.floor(Math.random() * 1000000),
            app_time: Date.now(), // miliseconds
            item: JSON.stringify(zalopayItems),
            embed_data: JSON.stringify(embed_data),
            amount: order.grandTotal,
            description: `Payment for the zalopayOrder #${transID}`,
            callback_url: config.callback_url,
            bank_code: '',
            mac: null,
          };

          const data =
            config.app_id +
            '|' +
            zalopayOrder.app_trans_id +
            '|' +
            zalopayOrder.app_user +
            '|' +
            zalopayOrder.amount +
            '|' +
            zalopayOrder.app_time +
            '|' +
            zalopayOrder.embed_data +
            '|' +
            zalopayOrder.item;
          zalopayOrder.mac = CryptoJS.HmacSHA256(data, config.key1).toString();
          const zaloPayResponse = await axios.post(config.endpoint, null, {
            params: zalopayOrder,
          });
          console.log('ZALOPAY RESPONSE', zaloPayResponse.data);

          const { return_code } = zaloPayResponse.data;

          //TODO: N???u th???t b???i
          if (return_code === 2) {
            await queryRunner.rollbackTransaction();
            return {
              status: HttpStatus.INTERNAL_SERVER_ERROR,
              message: 'Fail due to zalopay',
            };
          } else {
            await Promise.all(promise4.map((callback) => callback()));
            await queryRunner.commitTransaction();
            return {
              status: HttpStatus.OK,
              message: 'Confirm order checkout successfully',
              orderUrl: zaloPayResponse.data.order_url,
            };
          }

        case PaymentMethod.PAYPAL:
          console.log('Get exchangeRate');
          let exchangeRate;
          try {
            exchangeRate = await axios.get(
              'https://free.currconv.com/api/v7/convert?q=VND_USD&compact=ultra&apiKey=4ea1fc028af307b152e8',
            );
          } catch (error) {
            console.log(
              'Get ExchangeRate Error -> move to fallback exchangeRate',
            );
          }
          const rate = exchangeRate
            ? exchangeRate.data.VND_USD
            : DEFAULT_EXCHANGE_RATE;
          let subTotalUSD = 0;
          const items = order.orderItems.map((orderItem) => {
            const orderItemPriceUSD = parseFloat(
              (orderItem.subTotal * rate).toFixed(2),
            );
            subTotalUSD += parseFloat(
              (orderItemPriceUSD * orderItem.quantity).toFixed(2),
            );
            return {
              name: orderItem.name,
              unit_amount: {
                currency_code: 'USD',
                value: orderItemPriceUSD.toString(),
              },
              quantity: orderItem.quantity,
            };
          });
          subTotalUSD = parseFloat(subTotalUSD.toFixed(2));
          const shippingFeeUSD = parseFloat(
            (order.delivery.shippingFee * rate).toFixed(2),
          );
          const grandTotalUSD = parseFloat(
            (subTotalUSD + shippingFeeUSD).toFixed(2),
          );
          const amountPlatformFee = parseFloat(
            (subTotalUSD * PERCENT_PLATFORM_FEE + shippingFeeUSD).toFixed(2),
          );

          console.log('SubTotalUSD', subTotalUSD);
          console.log('GrandTotalUSD', grandTotalUSD);
          console.log('ShippingFeeUSD', shippingFeeUSD);
          console.log('amountPlatformFee', amountPlatformFee);
          console.log('paypalMerchantId', paypalMerchantId);

          //TODO: Ta??o paypal order
          const request = new paypal.orders.OrdersCreateRequest();
          request.headers['PayPal-Partner-Attribution-Id'] =
            process.env.PAYPAL_PARTNER_ATTRIBUTION_ID;
          request.prefer('return=representation');
          request.requestBody({
            intent: 'CAPTURE',
            // paypal local testing
            // application_context: {
            //   return_url: 'https://example.com',
            //   cancel_url: 'https://example.com',
            // },
            purchase_units: [
              {
                amount: {
                  currency_code: 'USD',
                  value: grandTotalUSD.toString(),
                  breakdown: {
                    item_total: {
                      currency_code: 'USD',
                      value: subTotalUSD.toString(),
                    },
                    shipping: {
                      currency_code: 'USD',
                      value: shippingFeeUSD.toString(),
                    },
                  },
                },
                payee: {
                  merchant_id: paypalMerchantId,
                },
                payment_instruction: {
                  disbursement_mode: 'INSTANT',
                  platform_fees: [
                    {
                      amount: {
                        currency_code: 'USD',
                        value: amountPlatformFee.toString(),
                      },
                      payee: {
                        merchant_id: process.env.PAYPAL_PARTNER_MERCHANT_ID,
                      },
                    },
                  ],
                },
                items: items,
              },
            ],
          });
          const paypalOrder = await client().execute(request);
          //TODO: N????u ch??a l??u paypalPayment
          if (!order.invoice?.payment?.paypalPayment) {
            console.log('NOT HAVING PAYPAL PAYMENT');
            const paypalPayment = new PaypalPayment();
            paypalPayment.paypalMerchantId = paypalMerchantId;
            paypalPayment.paypalOrderId = paypalOrder.result.id;
            paypalPayment.payment = payment;
            await queryRunner.manager.save(PaypalPayment, paypalPayment);
          } else {
            //TODO: N????u l??u r????i thi?? update la??i
            console.log('ALREADY PAYPALPAYMENT');
            order.invoice.payment.paypalPayment.paypalMerchantId =
              paypalMerchantId;
            order.invoice.payment.paypalPayment.paypalOrderId =
              paypalOrder.result.id;
            await queryRunner.manager.save(
              PaypalPayment,
              order.invoice.payment.paypalPayment,
            );
          }

          await queryRunner.commitTransaction();
          return {
            status: HttpStatus.OK,
            message: 'Confirm order checkout successfully',
            paypalOrderId: paypalOrder.result.id,
          };
      }
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async approvePaypalOrder(
    approvePaypalOrderDto: ApprovePaypalOrderDto,
  ): Promise<IApprovePaypalOrder> {
    let queryRunner;
    try {
      const { paypalOrderId, orderId, customerId } = approvePaypalOrderDto;

      //TODO: L????y th??ng tin order
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

      //TODO: N????u la?? order salechannel
      if (order.delivery) {
        //TODO: N????u order ??o?? ko pha??i do customer ta??o order ??o?? checkout (Authorization)
        if (order.delivery.customerId !== customerId) {
          return {
            status: HttpStatus.FORBIDDEN,
            message: 'Forbidden',
          };
        }
      }
      //TODO: Call PayPal to capture the order
      const request = new paypal.orders.OrdersCaptureRequest(paypalOrderId);
      request.headers['PayPal-Partner-Attribution-Id'] =
        process.env.PAYPAL_PARTNER_ATTRIBUTION_ID;
      request.requestBody({});

      const capture = await client().execute(request);
      //TODO: Save the capture ID to your database.
      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      const values: [IIsAutoConfirmResponse, any] = await Promise.all([
        this.userServiceClient
          .send('getIsAutoConfirm', {
            restaurantId: order.restaurantId,
          })
          .pipe(
            timeout(5000),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                return throwError(
                  new RequestTimeoutException(
                    'Internal timeout User server has problem!',
                  ),
                );
              }
              return throwError({ message: err });
            }),
          )
          .toPromise(),
        queryRunner.startTransaction(),
      ]);
      const captureID =
        capture.result.purchase_units[0].payments.captures[0].id;
      //TODO: L??u la??i captureId, update order status, payment status.
      order.invoice.payment.paypalPayment.captureId = captureID;
      //TODO: ??????i tra??ng tha??i payment sang ??ang x??? l??
      order.invoice.payment.status = PaymentStatus.PROCESSING;
      const doesConfirmOrder = values[0].isAutoConfirm;
      if (doesConfirmOrder) {
        // order.cashierId = cashierId;
        await Promise.all([
          queryRunner.manager.save(
            PaypalPayment,
            order.invoice.payment.paypalPayment,
          ),
          queryRunner.manager.save(Payment, order.invoice.payment),
          this.handleAutoConfirmOrder(order, queryRunner),
        ]);
      } else {
        await Promise.all([
          this.placeOrder(order, queryRunner),
          queryRunner.manager.save(
            PaypalPayment,
            order.invoice.payment.paypalPayment,
          ),
          queryRunner.manager.save(Payment, order.invoice.payment),
        ]);
      }

      await queryRunner.commitTransaction();

      if (doesConfirmOrder) {
        this.orderFulfillmentService.sendConfirmOrderEvent(order);
      } else {
        this.orderFulfillmentService.sendPlaceOrderEvent(order);
      }
      return {
        status: HttpStatus.OK,
        message: 'Approve paypal order successfully',
      };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async savePosOrder(
    savePosOrderDto: SavePosOrderDto,
  ): Promise<ISaveOrderResponse> {
    const { order } = savePosOrderDto;
    const orderResult = await this.orderRepository.save(order);
    return {
      status: HttpStatus.OK,
      message: 'Save order successfully',
      data: {
        order: orderResult,
      },
    };
  }

  async placeOrder(order: Order, queryRunner) {
    order.status = OrdStatus.ORDERED;
    order.delivery.orderTime = new Date();
    // calculate expected delivery time

    const preparationTime = getPreparationTime(order);
    order.delivery.expectedDeliveryTime = calculateExpectedDeliveryTime(
      order.delivery.orderTime,
      preparationTime,
      order.delivery.distance,
    );
    console.log('save order and delivery in placeOrder');
    await Promise.all([
      queryRunner.manager.save(Order, order),
      queryRunner.manager.save(Delivery, order.delivery),
    ]);
    console.log('save ok');
  }

  async getListOrderOfDriver(
    getListOrderOfDriverDto: GetListOrderOfDriverDto,
  ): Promise<IOrdersResponse> {
    try {
      const {
        callerId,
        driverId,
        query = DeliveryStatus.COMPLETED,
        page = 1,
        size = 10,
        from = null,
        to = null,
      } = getListOrderOfDriverDto;
      //TODO: N????u ng??????i go??i api k pha??i la?? driver ??o??
      if (callerId.toString() !== driverId.toString()) {
        return {
          status: HttpStatus.FORBIDDEN,
          message: 'Forbidden',
          orders: null,
        };
      }

      console.log('callerId', callerId);
      console.log('driverId', driverId);
      console.log('query', query);
      console.log('page', page);
      console.log('size', size);
      console.log('from', from);
      console.log('to', to);

      let orderQueryBuilder: SelectQueryBuilder<Order> = this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .skip((page - 1) * size)
        .take(size)
        .where('delivery.driverId = :driverId', {
          driverId: driverId,
        });

      if (from && to) {
        const fromDate = momenttimezone
          .tz(from, 'Asia/Ho_Chi_Minh')
          .utc()
          .format();
        const toDate = momenttimezone.tz(to, 'Asia/Ho_Chi_Minh').utc().format();

        console.log('fromdate', fromDate);
        console.log('todate', toDate);

        orderQueryBuilder = orderQueryBuilder
          .andWhere('order.createdAt >= :startDate', {
            startDate: fromDate,
          })
          .andWhere('order.createdAt <= :endDate', {
            endDate: toDate,
          });
      }

      let orders: IOrder[];
      switch (query) {
        case EDriverOrderType.ACTIVE:
          const activeStatus = [];
          activeStatus.push(DeliveryStatus.ON_GOING);
          activeStatus.push(DeliveryStatus.PICKED_UP);
          orders = await orderQueryBuilder
            .andWhere('delivery.status IN (:...deliveryStatus)', {
              deliveryStatus: activeStatus,
            })
            .getMany();
          break;
        case EDriverOrderType.COMPLETED:
          orders = await orderQueryBuilder
            .andWhere('delivery.status = :deliveryStatus', {
              deliveryStatus: DeliveryStatus.COMPLETED,
            })
            .getMany();
          break;
      }

      if (!orders || orders.length === 0) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'List order not found for that driver',
          orders: null,
        };
      }

      const mappedOrders = orders.map((order) => {
        const mappedOrderItems = order.orderItems.map((orderItem) => {
          return {
            id: orderItem.id,
            quantity: orderItem.quantity,
          };
        });

        return {
          ...order,
          orderItems: mappedOrderItems,
        };
      });

      return {
        status: HttpStatus.OK,
        message: 'List order of driver found',
        orders: mappedOrders,
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        orders: null,
      };
    }
  }

  async getOrdersOfCustomer(
    getOrdersOfCustomerDto: GetOrdersOfCustomerDto,
    orderStatuses: OrdStatus[] = [],
    isDraft = false,
  ): Promise<ICustomerOrdersResponse> {
    const {
      customerId,
      from = null,
      to = null,
      offset = 0,
      limit = 10,
    } = getOrdersOfCustomerDto;

    let orderQueryBuilder: SelectQueryBuilder<Order> = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.delivery', 'delivery')
      .leftJoinAndSelect('order.invoice', 'invoice')
      .leftJoinAndSelect('invoice.payment', 'payment')
      .where('delivery.customerId = :customerId', {
        customerId: customerId,
      });

    if (orderStatuses.length) {
      orderQueryBuilder = orderQueryBuilder.andWhere(
        'order.status IN (:...orderStatuses)',
        {
          orderStatuses: orderStatuses,
        },
      );
    }

    if (from && to) {
      const fromDate = momenttimezone
        .tz(from, 'Asia/Ho_Chi_Minh')
        .utc()
        .format();
      const toDate = momenttimezone.tz(to, 'Asia/Ho_Chi_Minh').utc().format();

      orderQueryBuilder = orderQueryBuilder
        .andWhere('delivery.orderTime >= :startDate', {
          startDate: fromDate,
        })
        .andWhere('delivery.orderTime <= :endDate', {
          endDate: toDate,
        });
    }

    orderQueryBuilder = orderQueryBuilder
      .select([
        'order',
        'delivery',
        'invoice.status',
        'payment.amount',
        'payment.method',
        'payment.status',
      ])
      .orderBy(isDraft ? 'order.updatedAt' : 'delivery.updatedAt', 'DESC')
      .skip(offset)
      .take(limit);

    const orders = await orderQueryBuilder.getMany();

    const completedOrderIds = orders.reduce((prev, cur) => {
      if (cur?.status === OrdStatus.COMPLETED) {
        prev.push(cur.id);
      }
      return prev;
    }, [] as string[]);
    if (!completedOrderIds.length) {
      return {
        status: HttpStatus.OK,
        message: 'Fetch orders of customer successfully',
        orders: orders,
      };
    }

    // try to get feedback
    try {
      const feedbacks = await this.getFeedbackOfOrders(completedOrderIds);
      const ordersWithFeedback: (ICustomerOrder & { feedback?: IFeedback })[] =
        orders.map((order) => {
          const feedback = feedbacks.find(
            (feedback) => order?.id === feedback?.orderId,
          );
          return {
            ...order,
            feedback: feedback || null,
          };
        });

      return {
        status: HttpStatus.OK,
        message: 'Fetch orders of customer successfully',
        orders: ordersWithFeedback,
      };
    } catch (e) {
      console.log('Cannot get feedbacks: ' + e.message);
      return {
        status: HttpStatus.OK,
        message: 'Fetch orders of customer successfully',
        orders: orders,
      };
    }
  }

  async getOnGoingOrdersOfCustomer(
    getOrdersOfCustomerDto: GetOrdersOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    return this.getOrdersOfCustomer(
      getOrdersOfCustomerDto,
      [OrdStatus.ORDERED, OrdStatus.CONFIRMED, OrdStatus.READY],
      false,
    );
  }

  async getOrderHistoryOfCustomer(
    getOrderHistoryOfCustomerDto: GetOrderHistoryOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    const { filter, ...getOrdersOfCustomerDto } = getOrderHistoryOfCustomerDto;

    const validFilter = filter
      ? filter
      : [OrdStatus.COMPLETED, OrdStatus.CANCELLED];

    const filteredOrderStatus = [
      OrdStatus.COMPLETED,
      OrdStatus.CANCELLED,
    ].filter((value) => validFilter.includes(value));

    return this.getOrdersOfCustomer(
      getOrdersOfCustomerDto,
      filteredOrderStatus,
      false,
    );
  }

  async getDraftOrdersOfCustomer(
    getOrdersOfCustomerDto: GetOrdersOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    return this.getOrdersOfCustomer(
      getOrdersOfCustomerDto,
      [OrdStatus.DRAFT],
      true,
    );
  }

  async getLastDraftOrderOfCustomer(
    getLastDraftOrderOfCustomerDto: GetLastDraftOrderOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    const { customerId } = getLastDraftOrderOfCustomerDto;
    return this.getOrdersOfCustomer(
      { limit: 1, offset: 0, customerId },
      [OrdStatus.DRAFT],
      true,
    );
  }

  async eventPaypalOrderOccur(
    eventPaypalOrderOccurDto: EventPaypalOrderOccurDto,
  ) {
    let queryRunner;
    console.dir({ eventPaypalOrderOccurDto }, { depth: 4 });
    try {
      const { event_type, resource } = eventPaypalOrderOccurDto;
      console.log(event_type);
      // console.log(resource);

      // find paymentId (captureId)

      let queryBuilder = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.invoice', 'invoice')
        .leftJoinAndSelect('invoice.payment', 'payment')
        .leftJoinAndSelect('payment.paypalPayment', 'paypalPayment');

      // TODO: L???y th??ng tin order d???a theo paypalOrderId
      const CHECKOUT_PATTERN = /CHECKOUT.*/;
      const PAYMENT_PATTERN_COMPLETED = /PAYMENT.*.COMPLETED/;
      const PAYMENT_PATTERN_REFUNDED = /PAYMENT.*.REFUNDED/;
      if (PAYMENT_PATTERN_COMPLETED.test(event_type)) {
        queryBuilder = queryBuilder.where(
          'paypalPayment.captureId = :paymentId',
          {
            paymentId: resource.id,
          },
        );
      } else if (PAYMENT_PATTERN_REFUNDED.test(event_type)) {
        queryBuilder = queryBuilder.where(
          'paypalPayment.refundId = :refundId',
          {
            refundId: resource.id,
          },
        );
      } else if (CHECKOUT_PATTERN.test(event_type)) {
        queryBuilder = queryBuilder.where(
          'paypalPayment.paypalOrderId = :paypalOrderId',
          {
            paypalOrderId: resource.id,
          },
        );
      } else {
        return;
      }
      const order = await queryBuilder.getOne();
      console.log('order', order);
      if (!order) {
        console.log('Cannot found order');
        return;
      }

      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      switch (event_type) {
        case 'PAYMENT.CAPTURE.COMPLETED':
          //TODO: Update l???i tr???ng th??i Invoice v?? Payment
          order.invoice.status = InvoiceStatus.PAID;
          order.invoice.payment.status = PaymentStatus.SUCCESS;
          await Promise.all([
            queryRunner.manager.save(Invoice, order.invoice),
            queryRunner.manager.save(Payment, order.invoice.payment),
          ]);
          break;
        // case 'PAYMENT.CAPTURE.DENIED':
        case 'PAYMENT.CAPTURE.REFUNDED':
          order.invoice.status = InvoiceStatus.REFUNDED;
          order.invoice.payment.status = PaymentStatus.REFUNDED;
          await Promise.all([
            queryRunner.manager.save(Invoice, order.invoice),
            queryRunner.manager.save(Payment, order.invoice.payment),
          ]);
          break;
        case 'CHECKOUT.ORDER.COMPLETED':
        case 'CHECKOUT.ORDER.APPROVED':
          console.log('CHECKOUT EVENT');
          console.log({ event_type });
          break;
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (queryRunner) {
        await queryRunner?.release();
      }
    }
  }

  async handleAutoConfirmOrder(order: Order, queryRunner: QueryRunner) {
    console.log('IN HandleAutoConfirm');
    order.status = OrdStatus.CONFIRMED;
    order.delivery.status = DeliveryStatus.ASSIGNING_DRIVER;
    order.delivery.orderTime = new Date();

    const preparationTime = getPreparationTime(order);
    order.delivery.expectedDeliveryTime = calculateExpectedDeliveryTime(
      order.delivery.orderTime,
      preparationTime,
      order.delivery.distance,
    );

    await Promise.all([
      queryRunner.manager.save(Order, order),
      queryRunner.manager.save(Delivery, order.delivery),
    ]);
    console.log('HandleAutoConfirm OK');
  }

  async getRestaurantStatistic(
    getRestaurantStatisticDto: GetRestaurantStatisticDto,
  ): Promise<IRestaurantStatisticResponse> {
    try {
      const { merchantId, restaurantId } = getRestaurantStatisticDto;
      console.log('GETRESTAURANTSTATISTIC');
      const aMonthAgoUTC = moment().subtract(30, 'day').utc().toISOString();
      console.log('aMonthAgoUTC', aMonthAgoUTC);

      const data: ICityAreaData[] = await this.deliveryLocationRepository
        .createQueryBuilder('deliveryL')
        .select([
          'deliveryL.areaId AS areaId',
          'deliveryL.areaName AS areaName',
          'deliveryL.cityName AS cityName',
          'deliveryL.cityId AS cityId',
        ])
        .addSelect('COUNT(order.id) AS numOrders')
        .leftJoin('deliveryL.order', 'order')
        .where('order.status = :orderCompletedStatus', {
          orderCompletedStatus: OrdStatus.COMPLETED,
        })
        .andWhere('order.restaurantId = :restaurantId', {
          restaurantId: restaurantId,
        })
        .andWhere('order.createdAt >= :aMonthAgoUTC', {
          aMonthAgoUTC: aMonthAgoUTC,
        })
        .groupBy('deliveryL.areaId')
        .addGroupBy('deliveryL.cityId')
        .addGroupBy('deliveryL.areaName')
        .addGroupBy('deliveryL.cityName')
        .getRawMany();

      if (!data || data.length === 0) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Cannot found any statistic',
        };
      }

      console.log('data', data);

      /* 
      [
        { 
          cityId:5, 
          areaId:1,
          cityName:'TPHCM', 
          areaName:'Quan 1',
          numOrders:5
        },
        { 
          cityId:5, 
          areaId:2,
          cityName:'TPHCM', 
          areaName:'Quan 2',
          numOrders:6
        },
        { 
          cityId:5, 
          areaId:3,
          cityName:'TPHCM',
          areaName:'Quan 3',
          numOrders:7
        },
      ]
      */
      return {
        status: HttpStatus.OK,
        message: 'Statistic calculated',
        statistic: data,
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    }
  }

  async getOrderStatisticsOfRestaurant(
    getOrderStatisticsOfRestaurantDto: GetOrderStatisticsOfRestaurantDto,
  ) {
    // const from = '2021-06-01';
    // const to = '2021-06-30';
    // const restaurantId = '6587f789-8c76-4a2e-9924-c14fc30629ef';
    const { from, to, restaurantId, groupByInterval } =
      getOrderStatisticsOfRestaurantDto;
    try {
      const orderStatisticsQuery = getOrderStatisticsQuery(
        restaurantId,
        from,
        to,
        groupByInterval,
      );

      // console.log({ orderStatisticsQuery });
      const response =
        ((await this.orderRepository.query(
          orderStatisticsQuery,
        )) as RestaurantOrderStatisticsDto[]) || [];
      // console.log({ response });
      return {
        status: HttpStatus.OK,
        message: 'Get order statistics of restaurant successfully',
        data: {
          statistics: response.map(RestaurantOrderStatisticsDto.convertToDTO),
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        data: null,
      };
    }
  }

  async getRevenueInsightOfRestaurant(
    getRevenueInsightOfRestaurantDto: GetRevenueInsightOfRestaurantDto,
  ) {
    // const from = '2021-06-01';
    // const to = '2021-06-30';
    // const restaurantId = '6587f789-8c76-4a2e-9924-c14fc30629ef';
    const { from, to, restaurantId } = getRevenueInsightOfRestaurantDto;
    try {
      const revenueInsightQuery = getRevenueQuery(restaurantId, from, to);

      // console.log({ orderStatisticsQuery });
      const response = ((await this.orderRepository.query(
        revenueInsightQuery,
      )) as RestaurantRevenueInsightDto) || [null];
      // console.log({ response });
      const insight = response[0];
      return {
        status: HttpStatus.OK,
        message: 'Get revenue insight of restaurant successfully',
        data: {
          revenueInsight: RestaurantRevenueInsightDto.convertToDTO(insight),
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        data: null,
      };
    }
  }

  async getMenuInsightOfRestaurant(
    getMenuInsightOfRestaurantDto: GetMenuInsightOfRestaurantDto,
  ) {
    // const from = '2021-06-01';
    // const to = '2021-06-30';
    // const restaurantId = '6587f789-8c76-4a2e-9924-c14fc30629ef';
    // const sortBy: 'totalOrder' | 'posOrder' | 'saleOrder' = 'posOrder';
    // const limit = 5;

    const {
      from,
      to,
      restaurantId,
      sortBy = MenuInsightSortBy.saleOrder,
      limit,
    } = getMenuInsightOfRestaurantDto;

    try {
      const menuInsightQuery = getMenuItemQuery(
        restaurantId,
        from,
        to,
        sortBy,
        limit,
      );

      const getCacheKey = (
        getMenuInsightOfRestaurantDto: GetMenuInsightOfRestaurantDto,
      ) => {
        const { from, to, restaurantId, sortBy, limit } =
          getMenuInsightOfRestaurantDto;
        return `restaurant:${restaurantId}:${from}-${to}:${sortBy}:${limit}`;
      };

      let response: RestaurantMenuInsightDto[] = null;

      const cacheKey = getCacheKey(getMenuInsightOfRestaurantDto);
      const cacheResponse = this.cacheService.get(
        cacheKey,
      ) as RestaurantMenuInsightDto[];

      if (cacheResponse) {
        response = cacheResponse;
        this.logger.log('Cache Hit!');
        // console.log({ cacheKey: 'cacheKey: ' + cacheKey, response });
      } else {
        // console.log({ menuInsightQuery });
        response =
          ((await this.orderRepository.query(
            menuInsightQuery,
          )) as RestaurantMenuInsightDto[]) || [];

        this.cacheService.set(cacheKey, response);
      }

      let populateResponse = [];
      if (response.length) {
        const menuItems = response.map(RestaurantMenuInsightDto.convertToDTO);

        const menuItemIds = menuItems.map(({ menuItemId }) => menuItemId);

        const {
          data: { menuItems: menuItemsResponse },
        } = await this.restaurantServiceClient
          .send('getMenuItemInfos', {
            menuItemIds,
          })
          .pipe(
            timeout(5000),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                return throwError(
                  new RequestTimeoutException(
                    'Internal timeout Restaurant server has problem!',
                  ),
                );
              }
              return throwError({ message: err });
            }),
          )
          .toPromise();

        // populate menu item infos with insight response
        populateResponse = (menuItemsResponse as Record<string, any>).reduce(
          (prev, menuItemData) => {
            if (menuItemData) {
              const { id, ...populateData } = menuItemData;

              const sourceMenuItem = menuItems.find(
                ({ menuItemId }) => menuItemId == id,
              );

              if (sourceMenuItem) {
                prev.push({ ...sourceMenuItem, ...populateData });
              }
            }
            return prev;
          },
          [] as (RestaurantMenuInsightDto & Record<string, any>)[],
        );

        if (menuItems.length > populateResponse.length) {
          this.logger.warn(`menu item data loss ${restaurantId}`);
        }
        // console.log({ menuItemsResponse, populateResponse });
      }

      return {
        status: HttpStatus.OK,
        message: 'Get menu insight of restaurant successfully',
        data: {
          menuItems: populateResponse,
        },
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        data: null,
      };
    }
  }

  async getOrderRatingInfos(
    getOrderRatingInfosDto: GetOrderRatingInfosDto,
  ): Promise<IGetOrderRatingInfosResponse> {
    const { customerId, orderId } = getOrderRatingInfosDto;
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
        data: null,
      };
    }

    if (order?.delivery?.customerId != customerId) {
      return {
        status: HttpStatus.FORBIDDEN,
        message: 'Cannot access another order',
        data: null,
      };
    }
    const {
      restaurantId,
      delivery: { deliveredAt, driverId },
    } = order;

    return {
      status: HttpStatus.OK,
      message: 'Success',
      data: {
        deliveredAt,
        driverId,
        restaurantId,
      },
    };
  }

  async getFeedbackOfOrders(orderIds: string[]): Promise<IFeedback[]> {
    const response = await this.userServiceClient
      .send('getFeedbackOfOrders', {
        orderIds: orderIds,
      })
      .pipe(
        timeout(3000),
        catchError((err) => {
          if (err instanceof TimeoutError) {
            return null;
          }
          return throwError({ message: err });
        }),
      )
      .toPromise();
    if (!response || !response?.data?.feedbacks) {
      return null;
    }
    const {
      data: { feedbacks = [] },
    } = response;
    return feedbacks;
  }

  //! S??? ki???n thanh to??n th??nh c??ng c???a ZALOPAY
  async eventPaymentZALOPAY(eventPaymentZALOPAYDto: EventPaymentZALOPAYDto) {
    let queryRunner;
    console.log('eventPaymentZALOPAYDto', eventPaymentZALOPAYDto);
    try {
      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // APP INFO
      const config = {
        app_id: '2553',
        key1: 'PcY4iZIKFCIdgZvA6ueMcMHHUbRLYjPL',
        key2: 'kLtgPl8HHhfvMuDHPwKfgfsY4Ydm9eIz',
        endpoint: 'https://sb-openapi.zalopay.vn/v2/create',
        callback_url: `https://apigway.herokuapp.com/order/payment-result`,
      };

      const { data, orderId } = eventPaymentZALOPAYDto;

      const result: IResultZALOPAY = {
        return_code: null,
        return_message: null,
      };

      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.invoice', 'invoice')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('invoice.payment', 'payment')
        .where('order.id = :orderId', { orderId: orderId })
        .getOne();

      try {
        const dataStr = data;
        const reqMac = eventPaymentZALOPAYDto.mac;

        const mac = CryptoJS.HmacSHA256(dataStr, config.key2).toString();
        console.log('mac =', mac);

        // ki???m tra callback h???p l??? (?????n t??? ZaloPay server)
        if (reqMac !== mac) {
          // callback kh??ng h???p l???
          result.return_code = -1;
          result.return_message = 'mac not equal';
          await queryRunner.rollbackTransaction();
          return result;
        } else {
          // thanh to??n th??nh c??ng
          // merchant c???p nh???t tr???ng th??i cho ????n h??ng
          const dataJson = JSON.parse(dataStr);
          order.invoice.status = InvoiceStatus.PAID;
          order.invoice.payment.status = PaymentStatus.SUCCESS;

          result.return_code = 1;
          result.return_message = 'success';
          console.log('result', result);
          const { isAutoConfirm }: IIsAutoConfirmResponse =
            await this.userServiceClient
              .send('getIsAutoConfirm', {
                restaurantId: order.restaurantId,
              })
              .pipe(
                timeout(5000),
                catchError((err) => {
                  if (err instanceof TimeoutError) {
                    return throwError(
                      new RequestTimeoutException(
                        'Internal timeout User server has problem!',
                      ),
                    );
                  }
                  return throwError({ message: err });
                }),
              )
              .toPromise();
          console.log('isAutoConfirm', isAutoConfirm);
          const doesConfirmOrder = isAutoConfirm;
          if (doesConfirmOrder) {
            // order.cashierId = cashierId;
            console.log('AUTOCONFIRM ORDER');
            await Promise.all([
              queryRunner.manager.save(Payment, order.invoice.payment),
              queryRunner.manager.save(Invoice, order.invoice),
              this.handleAutoConfirmOrder(order, queryRunner),
            ]);
          } else {
            console.log('MERCHANT CONFIRM ORDER');
            await Promise.all([
              this.placeOrder(order, queryRunner),
              queryRunner.manager.save(Payment, order.invoice.payment),
              queryRunner.manager.save(Invoice, order.invoice),
            ]);
          }

          await queryRunner.commitTransaction();

          if (doesConfirmOrder) {
            console.log('Send confirm order event');
            this.orderFulfillmentService.sendConfirmOrderEvent(order);
          } else {
            console.log('send place order event');
            this.orderFulfillmentService.sendPlaceOrderEvent(order);
          }
        }
      } catch (ex) {
        result.return_code = 0; // ZaloPay server s??? callback l???i (t???i ??a 3 l???n)
        result.return_message = ex.message;
      }
      // th??ng b??o k???t qu??? cho ZaloPay server
      return result;
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
    } finally {
      if (queryRunner) {
        await queryRunner?.release();
      }
    }
  }

  //! Frontend g???i ????? update tr???ng th??i payment ZALOPAY
  async updateZALOPAYPaymentStatus(
    updateZALOPAYPaymentStatusDto: UpdateZALOPAYPaymentStatusDto,
  ): Promise<ISimpleResponse> {
    let queryRunner;
    try {
      const { orderId, customerId } = updateZALOPAYPaymentStatusDto;
      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      //TODO: L????y th??ng tin order
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.invoice', 'invoice')
        .leftJoinAndSelect('invoice.payment', 'payment')
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

      //TODO: N????u la?? order salechannel
      if (order.delivery) {
        //TODO: N????u order ??o?? ko pha??i do customer ta??o order ??o?? checkout (Authorization)
        if (order.delivery.customerId !== customerId) {
          return {
            status: HttpStatus.FORBIDDEN,
            message: 'Forbidden',
          };
        }
      }
      const values: [IIsAutoConfirmResponse, any] = await Promise.all([
        this.userServiceClient
          .send('getIsAutoConfirm', {
            restaurantId: order.restaurantId,
          })
          .pipe(
            timeout(5000),
            catchError((err) => {
              if (err instanceof TimeoutError) {
                return throwError(
                  new RequestTimeoutException(
                    'Internal timeout User server has problem!',
                  ),
                );
              }
              return throwError({ message: err });
            }),
          )
          .toPromise(),
        queryRunner.startTransaction(),
      ]);
      //TODO: ??????i tra??ng tha??i payment sang ??ang x??? l??
      order.invoice.payment.status = PaymentStatus.PROCESSING;
      const doesConfirmOrder = values[0].isAutoConfirm;
      if (doesConfirmOrder) {
        // order.cashierId = cashierId;
        await Promise.all([
          queryRunner.manager.save(Payment, order.invoice.payment),
          this.handleAutoConfirmOrder(order, queryRunner),
        ]);
      } else {
        await Promise.all([
          this.placeOrder(order, queryRunner),
          queryRunner.manager.save(Payment, order.invoice.payment),
        ]);
      }

      await queryRunner.commitTransaction();

      if (doesConfirmOrder) {
        this.orderFulfillmentService.sendConfirmOrderEvent(order);
      } else {
        this.orderFulfillmentService.sendPlaceOrderEvent(order);
      }
      return {
        status: HttpStatus.OK,
        message: 'Update zalopay payment and dispatch event',
      };
    } catch (error) {
      this.logger.error(error);
      await queryRunner.rollbackTransaction();
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }
}

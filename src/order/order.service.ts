import { OrderFulfillmentService } from './../order-fulfillment/order-fulfillment.service';
import { SavePosOrderDto } from './dto/pos-order/save-pos-order.dto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectRepository } from '@nestjs/typeorm';
import { Connection, Repository, SelectQueryBuilder } from 'typeorm';
import {
  AddNewItemToOrderDto,
  ApprovePaypalOrderDto,
  ConfirmOrderCheckoutDto,
  GetAllRestaurantOrderDto,
  GetListOrderOfDriverDto,
  GetOrderAssociatedWithCusAndResDto,
  GetOrderDetailDto,
  GetOrderHistoryOfCustomerDto,
  GetOrdersOfCustomerDto,
  IncreaseOrderItemQuantityDto,
  ReduceOrderItemQuantityDto,
  RemoveOrderItemDto,
  UpdateDeliveryAddressDto,
  UpdateOrderItemQuantityDto,
} from './dto';
import { CreateOrderDto } from './dto/create-order.dto';
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
import {
  OrdStatus,
  DeliveryStatus,
  GetRestaurantOrder,
  PaymentMethod,
  PaymentStatus,
  InvoiceStatus,
  EDriverOrderType,
} from './enums';
import {
  IApprovePaypalOrder,
  IConfirmOrderCheckoutResponse,
  ICreateOrderResponse,
  ICustomerOrdersResponse,
  IOrder,
  IOrdersResponse,
  ISaveOrderResponse,
} from './interfaces';
import { createAndStoreOrderItem } from './helpers';
import {
  calculateOrderSubTotal,
  calculateOrderGrandToTal,
  findOrderItem,
  findOrderItemIndex,
  calculateShippingFee,
} from './helpers/order-logic.helper';
import * as paypal from '@paypal/checkout-server-sdk';
import { client } from '../config/paypal';
import axios from 'axios';
import * as uniqid from 'uniqid';
const DEFAULT_EXCHANGE_RATE = 0.00004;
const PERCENT_PLATFORM_FEE = 0.2;

import * as paypalRest from 'paypal-rest-sdk';

paypalRest.configure({
  mode: 'sandbox', // Sandbox or live
  client_id: process.env.PAYPAL_CLIENT_ID,
  client_secret: process.env.PAYPAL_CLIENT_SECRET,
});

console.log('NODE_ENV', process.env.NODE_ENV);

const webhook_json = {
  url: 'https://apigway.herokuapp.com/customer/event/order',
  event_types: [
    {
      name: 'PAYMENT.CAPTURE.COMPLETED',
    }
  ],
};

paypalRest.notification.webhook.create(webhook_json, function (error, webhook) {
  if (error) {
    console.error(JSON.stringify(error.response));
    // throw error;
  } else {
    console.log('Create webhook Response');
    console.log(webhook);
  }
});

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
    @InjectRepository(Invoice)
    private invoiceRepository: Repository<Invoice>,
    @InjectConnection()
    private connection: Connection,
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
      // Tạo và lưu orderItem
      const { addOrderItems, totalPriceToppings } =
        await createAndStoreOrderItem(orderItem, queryRunner);
      // Tạo và lưu order
      const order = new Order();
      order.restaurantId = restaurantId;
      order.status = OrdStatus.DRAFT;
      order.orderItems = addOrderItems;
      order.subTotal =
        (orderItem.price + totalPriceToppings) * orderItem.quantity;

      if (!customerId) {
        // Nếu là order bên POS thì có cashierId
        order.cashierId = cashierId;
        order.grandTotal = calculateOrderGrandToTal(order);
        await queryRunner.manager.save(Order, order);
        return {
          status: HttpStatus.CREATED,
          message: 'Order created successfully',
          order: order,
        };
      }
      // Nếu là order bên salechannel thì có customerId
      // Tạo và lưu delivery
      const delivery = new Delivery();
      await queryRunner.manager.save(Order, order);
      console.log('Order', order);
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

      /* Nếu customer có địa chỉ */
      if (customerGeom) {
        this.handleCustomerAddressChange(order, {
          address: customerAddress,
          geo: customerGeom,
        });
      }
      await queryRunner.manager.save(Delivery, delivery);
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
      await queryRunner.release();
    }
  }

  async getOrderAssociatedWithCusAndRes(
    getOrderAssociatedWithCusAndResDto: GetOrderAssociatedWithCusAndResDto,
  ): Promise<ICreateOrderResponse> {
    try {
      const { customerId, restaurantId } = getOrderAssociatedWithCusAndResDto;
      //TODO: Lấy ra order DRAFT của customer đối với nhà hàng cụ thể
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
      // Tìm ra order với orderId
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
      // Nếu item gửi lên orderItem đã có sẵn và  giống y chang topping
      // trong order thì tăng số lượng orderItem đã có sẵn
      if (foundOrderItem) {
        foundOrderItem.quantity += sendItem.quantity;
        await queryRunner.manager.save(OrderItem, foundOrderItem);
        order.orderItems[foundOrderItemIndex] = foundOrderItem;
        // Tính toán lại giá
        order.subTotal = calculateOrderSubTotal(order.orderItems);
      } else {
        // Nếu item gửi lên giống với orderItem đã có sẵn nhưng khác topping hoặc gửi lên không giống
        // thì tạo orderItem mới
        // Tạo và lưu orderItem với orderItemTopping tương ứng
        const { addOrderItems, totalPriceToppings } =
          await createAndStoreOrderItem(sendItem, queryRunner);

        // Lưu orderItem mới vào order
        order.orderItems = [...order.orderItems, ...addOrderItems];
        // Tính toán lại giá và lưu lại order
        const totalOrderItemPrice =
          (sendItem.price + totalPriceToppings) * sendItem.quantity;
        order.subTotal += totalOrderItemPrice;
      }
      order.grandTotal = calculateOrderGrandToTal(order);
      // Lưu lại order
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
      await queryRunner.release();
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

      // Tìm ra orderitem đó và sửa lại quantity
      const orderItem = order.orderItems.find(
        (item) => item.id === orderItemId,
      );

      orderItem.quantity -= 1;
      // Nếu quantity là 0 thì xóa orderItem khỏi order
      if (orderItem.quantity < 1) {
        const newOrderItems = order.orderItems.filter(
          (ordItem) => ordItem.id !== orderItem.id,
        );
        order.orderItems = newOrderItems;
        // Remove hết tất cả orderItemTopping của orderItem đó
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
      await queryRunner.release();
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
      // Tìm ra orderitem đó và sửa lại quantity
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
      await queryRunner.release();
    }
  }

  async removeOrderItem(
    removeOrderItemDto: RemoveOrderItemDto,
  ): Promise<ICreateOrderResponse> {
    let queryRunner;
    try {
      // TODO: make this a transaction
      const { orderItemId, orderId } = removeOrderItemDto;
      // Tìm lại order với orderId
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
      // Xóa các orderItemTopping của orderItem đó nếu có
      await queryRunner.manager.remove(
        OrderItemTopping,
        orderItemToDelete.orderItemToppings,
      );
      // Xóa orderItem đó trong order.orderItems trả về người dùng
      order.orderItems = order.orderItems.filter(
        (ordItem) => ordItem.id !== orderItemId,
      );
      // Xóa orderItem đó
      await queryRunner.manager.remove(OrderItem, orderItemToDelete);

      let flag = 0;

      // Nếu như order không còn orderItem nào thì xóa order
      if (order.orderItems.length === 0) {
        flag = 1;
        if (order.delivery) {
          await queryRunner.manager.remove(Delivery, order.delivery);
        }
        await queryRunner.manager.remove(Order, order);
      } else {
        // Tính toán lại giá
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
      await queryRunner.release();
    }
  }

  async getOrdersOfRestaurant(
    getAllRestaurantOrderDto: GetAllRestaurantOrderDto,
  ): Promise<IOrdersResponse> {
    const {
      restaurantId,
      query,
      pageNumber,
      start,
      end,
      orderStatus = null,
    } = getAllRestaurantOrderDto;

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

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      orderQueryBuilder = orderQueryBuilder
        .andWhere('order.createdAt >= :startDate', {
          startDate: startDate.toISOString(),
        })
        .andWhere('order.createdAt <= :endDate', {
          endDate: endDate.toISOString(),
        });
    }

    if (query === GetRestaurantOrder.POS) {
      orderQueryBuilder = orderQueryBuilder.andWhere('delivery.id IS NULL');
    }

    if (query === GetRestaurantOrder.SALE) {
      orderQueryBuilder = orderQueryBuilder.andWhere('delivery.id IS NOT NULL');
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
  }

  async getOrderDetail(
    getOrderDetailDto: GetOrderDetailDto,
  ): Promise<ICreateOrderResponse> {
    try {
      const { orderId } = getOrderDetailDto;
      // Tìm lại order với orderId

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

      return {
        status: HttpStatus.OK,
        message: 'Order fetched successfully',
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

      // Tìm ra orderitem đó và sửa lại quantity
      const orderItem = order.orderItems.find(
        (item) => item.id === orderItemId,
      );

      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      orderItem.quantity = quantity;
      // Nếu quantity là 0 thì xóa orderItem khỏi order
      if (orderItem.quantity < 1) {
        const newOrderItems = order.orderItems.filter(
          (ordItem) => ordItem.id !== orderItem.id,
        );
        order.orderItems = newOrderItems;
        // Remove hết tất cả orderItemTopping của orderItem đó
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
      await queryRunner.release();
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
      //TODO: Tìm ra order với orderId
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
    const AVG_TIME_PER_1KM = 10;
    const calculateEAT = (
      restaurantPreparationTime: number,
      deliveryDistance: number,
    ) =>
      restaurantPreparationTime + (deliveryDistance / 1000) * AVG_TIME_PER_1KM;
    const getPreparationTime = (order: Order) => 12;

    const preparationTime = getPreparationTime(order);
    const EAT = calculateEAT(preparationTime, distance);
    const expectedDeliveryTime = new Date(Date.now() + EAT * 1000 * 60);
    order.delivery.expectedDeliveryTime = expectedDeliveryTime;

    order.grandTotal = calculateOrderGrandToTal(order);
  }

  async confirmOrderCheckout(
    confirmOrderCheckoutDto: ConfirmOrderCheckoutDto,
  ): Promise<IConfirmOrderCheckoutResponse> {
    let queryRunner;
    try {
      const { note, paymentMethod, orderId, customerId, paypalMerchantId } =
        confirmOrderCheckoutDto;

      //TODO: Lấy thông tin order
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
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

      //TODO: Nếu là order salechannel
      if (order.delivery) {
        //TODO: Nếu order đó ko phải do customer tạo order đó checkout (Authorization)
        if (order.delivery.customerId !== customerId) {
          return {
            status: HttpStatus.FORBIDDEN,
            message: 'Forbidden',
          };
        }
      }
      //TODO: Nếu đã tạo paypalOrderId rồi
      if (paymentMethod === PaymentMethod.PAYPAL) {
        if (order.invoice) {
          return {
            status: HttpStatus.OK,
            message: 'Confirm order checkout successfully',
            paypalOrderId: order.invoice.payment.paypalPayment.paypalOrderId,
          };
        }
      }
      //TODO: Thêm note cho order nếu có
      if (note) {
        order.note = note;
      }
      queryRunner = this.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      //TODO: Tạo invoice, payment entity với phương thức thanh toán
      const invoice = new Invoice();
      invoice.order = order;
      invoice.status = InvoiceStatus.UNPAID;
      invoice.invoiceNumber = uniqid('invoice-');
      order.invoice = invoice;
      await Promise.all([
        queryRunner.manager.save(Order, order),
        queryRunner.manager.save(Invoice, invoice),
      ]);

      const payment = new Payment();
      payment.amount = calculateOrderGrandToTal(order);
      payment.invoice = invoice;
      payment.status = PaymentStatus.PENDING_USER_ACTION;
      payment.method = paymentMethod;
      await queryRunner.manager.save(Payment, payment);

      switch (paymentMethod) {
        case PaymentMethod.COD:
          await this.placeOrder(order, queryRunner);
          await queryRunner.commitTransaction();
          return {
            status: HttpStatus.OK,
            message: 'Confirm order checkout successfully',
          };
        case PaymentMethod.PAYPAL:
          const exchangeRate = await axios.get(
            'https://free.currconv.com/api/v7/convert?q=VND_USD&compact=ultra&apiKey=4ea1fc028af307b152e8',
          );
          const rate = exchangeRate.data.VND_USD || DEFAULT_EXCHANGE_RATE;
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

          //TODO: Tạo paypal order
          const request = new paypal.orders.OrdersCreateRequest();
          request.headers['PayPal-Partner-Attribution-Id'] =
            process.env.PAYPAL_PARTNER_ATTRIBUTION_ID;
          request.prefer('return=representation');
          request.requestBody({
            intent: 'CAPTURE',
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
                        merchant_id: 'LU9XXKX9PSTRW',
                      },
                    },
                  ],
                },
                items: items,
              },
            ],
          });
          const paypalOrder = await client().execute(request);
          //TODO: Tạo đối tượng paypal payment và lưu lại
          const paypalPayment = new PaypalPayment();
          paypalPayment.paypalOrderId = paypalOrder.result.id;
          paypalPayment.payment = payment;
          await queryRunner.manager.save(PaypalPayment, paypalPayment);
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
      await queryRunner.release();
    }
  }

  async approvePaypalOrder(
    approvePaypalOrderDto: ApprovePaypalOrderDto,
  ): Promise<IApprovePaypalOrder> {
    let queryRunner;
    try {
      const { paypalOrderId, orderId, customerId } = approvePaypalOrderDto;

      //TODO: Lấy thông tin order
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

      //TODO: Nếu là order salechannel
      if (order.delivery) {
        //TODO: Nếu order đó ko phải do customer tạo order đó checkout (Authorization)
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
      await queryRunner.startTransaction();
      const captureID =
        capture.result.purchase_units[0].payments.captures[0].id;
      //TODO: Lưu lại captureId, update order status, payment status.
      order.invoice.payment.paypalPayment.captureId = captureID;
      //TODO: Đổi trạng thái payment sang đang xử lý
      order.invoice.payment.status = PaymentStatus.PROCESSING;
      //TODO: Đổi trạng thái invoice sang đã thanh toán
      order.invoice.status = InvoiceStatus.PAID;
      await Promise.all([
        this.placeOrder(order, queryRunner),
        queryRunner.manager.save(
          PaypalPayment,
          order.invoice.payment.paypalPayment,
        ),
        queryRunner.manager.save(Payment, order.invoice.payment),
        queryRunner.manager.save(Invoice, order.invoice),
      ]);
      await queryRunner.commitTransaction();

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
      await queryRunner.release();
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
    await Promise.all([
      queryRunner.manager.save(Order, order),
      queryRunner.manager.save(Delivery, order.delivery),
    ]);
    this.orderFulfillmentService.sendPlaceOrderEvent(order);
  }

  async getListOrderOfDriver(
    getListOrderOfDriverDto: GetListOrderOfDriverDto,
  ): Promise<IOrdersResponse> {
    try {
      const { callerId, driverId, query } = getListOrderOfDriverDto;
      //TODO: Nếu người gọi api k phải là driver đó
      if (callerId.toString() !== driverId.toString()) {
        return {
          status: HttpStatus.FORBIDDEN,
          message: 'Forbidden',
          orders: null,
        };
      }

      const orderQueryBuilder: SelectQueryBuilder<Order> = this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .where('delivery.driverId = :driverId', {
          driverId: driverId,
        });
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
      // console.log('FindOrder', orders);

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

      if (!orders || orders.length === 0) {
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'List order not found for that driver',
          orders: null,
        };
      }

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
      const fromDate = new Date(from);
      const toDate = new Date(to);

      orderQueryBuilder = orderQueryBuilder
        .andWhere('delivery.orderTime >= :startDate', {
          startDate: fromDate.toISOString(),
        })
        .andWhere('delivery.orderTime <= :endDate', {
          endDate: toDate.toISOString(),
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

    return {
      status: HttpStatus.OK,
      message: 'Fetch orders of customer successfully',
      orders: orders,
    };
  }

  async getOnGoingOrdersOfCustomer(
    getOrdersOfCustomerDto: GetOrdersOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    return this.getOrdersOfCustomer(
      getOrdersOfCustomerDto,
      [OrdStatus.ORDERED, OrdStatus.CONFIRMED],
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
}

import { OrderFulfillmentService } from './../order-fulfillment/order-fulfillment.service';
import { SavePosOrderDto } from './dto/pos-order/save-pos-order.dto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  AddNewItemToOrderDto,
  ApprovePaypalOrderDto,
  ConfirmOrderCheckoutDto,
  GetAllRestaurantOrderDto,
  GetListOrderOfDriverDto,
  GetOrderAssociatedWithCusAndResDto,
  GetOrderDetailDto,
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
  ) {}

  async createOrderAndFirstOrderItem(
    createOrderDto: CreateOrderDto,
  ): Promise<ICreateOrderResponse> {
    const {
      orderItem,
      restaurantId,
      customerId,
      cashierId,
      restaurantGeom,
      customerGeom,
      restaurantAddress,
      customerAddress,
    } = createOrderDto;
    try {
      // TODO: make this a transaction
      // Tạo và lưu orderItem
      const {
        addOrderItems,
        totalPriceToppings,
      } = await createAndStoreOrderItem(
        orderItem,
        this.orderItemToppingRepository,
        this.orderItemRepository,
      );
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
        await this.orderRepository.save(order);
        return {
          status: HttpStatus.CREATED,
          message: 'Order created successfully',
          order: order,
        };
      }

      // Nếu là order bên salechannel thì có customerId
      // Tạo và lưu delivery
      const delivery = new Delivery();
      order.delivery = delivery;
      delivery.order = order;
      delivery.customerId = customerId;
      delivery.status = DeliveryStatus.DRAFT;
      delivery.restaurantGeom = restaurantGeom;
      delivery.restaurantAddress = restaurantAddress;

      /* Nếu customer có địa chỉ */
      if (customerGeom) {
        this.handleCustomerAddressChange(order, {
          address: customerAddress,
          geo: customerGeom,
        });
      }

      await Promise.all([
        this.deliveryRepository.save(order.delivery),
        this.orderRepository.save(order),
      ]);

      delete delivery.order;
      const newOrder = { ...order, delivery: delivery };

      return {
        status: HttpStatus.CREATED,
        message: 'Order created successfully',
        order: newOrder,
      };
    } catch (error) {
      this.logger.error(error);
      console.log('Error in createOrder');

      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
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

      const foundOrderItem = findOrderItem(sendItem, order.orderItems);
      const foundOrderItemIndex = findOrderItemIndex(
        sendItem,
        order.orderItems,
      );
      // Nếu item gửi lên orderItem đã có sẵn và  giống y chang topping
      // trong order thì tăng số lượng orderItem đã có sẵn
      if (foundOrderItem) {
        foundOrderItem.quantity += sendItem.quantity;
        await this.orderItemRepository.save(foundOrderItem);
        order.orderItems[foundOrderItemIndex] = foundOrderItem;
        // Tính toán lại giá
        order.subTotal = calculateOrderSubTotal(order.orderItems);
      } else {
        // Nếu item gửi lên giống với orderItem đã có sẵn nhưng khác topping hoặc gửi lên không giống
        // thì tạo orderItem mới
        // Tạo và lưu orderItem với orderItemTopping tương ứng
        const {
          addOrderItems,
          totalPriceToppings,
        } = await createAndStoreOrderItem(
          sendItem,
          this.orderItemToppingRepository,
          this.orderItemRepository,
        );

        // Lưu orderItem mới vào order
        order.orderItems = [...order.orderItems, ...addOrderItems];
        // Tính toán lại giá và lưu lại order
        const totalOrderItemPrice =
          (sendItem.price + totalPriceToppings) * sendItem.quantity;
        order.subTotal += totalOrderItemPrice;
      }
      order.grandTotal = calculateOrderGrandToTal(order);
      // Lưu lại order
      await this.orderRepository.save(order);
      return {
        status: HttpStatus.OK,
        message: 'New orderItem added successfully',
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

  async reduceOrderItemQuantity(
    reduceOrderItemQuantityDto: ReduceOrderItemQuantityDto,
  ): Promise<ICreateOrderResponse> {
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
        await this.orderItemToppingRepository.remove(
          orderItem.orderItemToppings,
        );
        if (newOrderItems.length === 0) {
          flag = 1;
          await this.orderItemRepository.remove(orderItem);
          if (order.delivery) {
            await this.deliveryRepository.remove(order.delivery);
          }
          await this.orderRepository.remove(order);
        } else {
          order.subTotal = calculateOrderSubTotal(order.orderItems);
          order.grandTotal = calculateOrderGrandToTal(order);
          await Promise.all([
            this.orderRepository.save(order),
            this.orderItemRepository.remove(orderItem),
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
          this.orderItemRepository.save(orderItem),
          this.orderRepository.save(order),
        ]);
      }
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
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
    }
  }

  async increaseOrderItemQuantity(
    increaseOrderItemQuantityDto: IncreaseOrderItemQuantityDto,
  ): Promise<ICreateOrderResponse> {
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
      await Promise.all([
        this.orderItemRepository.save(orderItem),
        this.orderRepository.save(order),
      ]);

      return {
        status: HttpStatus.OK,
        message: 'Increase orderItem quantity successfully',
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

  async removeOrderItem(
    removeOrderItemDto: RemoveOrderItemDto,
  ): Promise<ICreateOrderResponse> {
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

      const orderItemToDelete = order.orderItems.find(
        (ordItem) => ordItem.id === orderItemId,
      );
      // Xóa các orderItemTopping của orderItem đó nếu có
      await this.orderItemToppingRepository.remove(
        orderItemToDelete.orderItemToppings,
      );
      // Xóa orderItem đó trong order.orderItems trả về người dùng
      order.orderItems = order.orderItems.filter(
        (ordItem) => ordItem.id !== orderItemId,
      );
      // Xóa orderItem đó
      await this.orderItemRepository.remove(orderItemToDelete);

      let flag = 0;

      // Nếu như order không còn orderItem nào thì xóa order
      if (order.orderItems.length === 0) {
        flag = 1;
        if (order.delivery) {
          await this.deliveryRepository.remove(order.delivery);
        }
        await this.orderRepository.remove(order);
      } else {
        // Tính toán lại giá
        order.subTotal = calculateOrderSubTotal(order.orderItems);
        order.grandTotal = calculateOrderGrandToTal(order);
        await Promise.all([this.orderRepository.save(order)]);
      }
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
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
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

      orderItem.quantity = quantity;
      // Nếu quantity là 0 thì xóa orderItem khỏi order
      if (orderItem.quantity < 1) {
        const newOrderItems = order.orderItems.filter(
          (ordItem) => ordItem.id !== orderItem.id,
        );
        order.orderItems = newOrderItems;
        // Remove hết tất cả orderItemTopping của orderItem đó
        await this.orderItemToppingRepository.remove(
          orderItem.orderItemToppings,
        );
        if (newOrderItems.length === 0) {
          flag = 1;
          await this.orderItemRepository.remove(orderItem);
          if (order.delivery) {
            await this.deliveryRepository.remove(order.delivery);
          }
          await this.orderRepository.remove(order);
        } else {
          order.subTotal = calculateOrderSubTotal(order.orderItems);
          order.grandTotal = calculateOrderGrandToTal(order);
          await Promise.all([
            this.orderRepository.save(order),
            this.orderItemRepository.remove(orderItem),
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
          this.orderItemRepository.save(orderItem),
          this.orderRepository.save(order),
        ]);
      }
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
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
        order: null,
      };
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
    order.grandTotal = calculateOrderGrandToTal(order);
  }

  async confirmOrderCheckout(
    confirmOrderCheckoutDto: ConfirmOrderCheckoutDto,
  ): Promise<IConfirmOrderCheckoutResponse> {
    console.log('push');
    try {
      const {
        note,
        paymentMethod,
        orderId,
        customerId,
        paypalMerchantId,
      } = confirmOrderCheckoutDto;

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
      //TODO: Tạo invoice, payment entity với phương thức thanh toán
      const invoice = new Invoice();
      invoice.order = order;
      invoice.status = InvoiceStatus.UNPAID;
      invoice.invoiceNumber = uniqid('invoice-');
      order.invoice = invoice;
      await Promise.all([
        this.orderRepository.save(order),
        this.invoiceRepository.save(invoice),
      ]);

      const payment = new Payment();
      payment.amount = calculateOrderGrandToTal(order);
      payment.invoice = invoice;
      payment.status = PaymentStatus.PENDING;
      payment.method = paymentMethod;
      await this.paymentRepository.save(payment);

      switch (paymentMethod) {
        case PaymentMethod.COD:
          await this.placeOrder(order);
          break;
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
          console.log('OK');
          //TODO: Tạo đối tượng paypal payment và lưu lại
          const paypalPayment = new PaypalPayment();
          paypalPayment.paypalOrderId = paypalOrder.result.id;
          paypalPayment.payment = payment;
          await this.paypalPaymentRepository.save(paypalPayment);

          return {
            status: HttpStatus.OK,
            message: 'Confirm order checkout successfully',
            paypalOrderId: paypalOrder.result.id,
          };
      }

      return {
        status: HttpStatus.OK,
        message: 'Confirm order checkout successfully',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
    }
  }

  async approvePaypalOrder(
    approvePaypalOrderDto: ApprovePaypalOrderDto,
  ): Promise<IApprovePaypalOrder> {
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
      const captureID =
        capture.result.purchase_units[0].payments.captures[0].id;
      //TODO: Lưu lại captureId, update order status, payment status.
      order.invoice.payment.paypalPayment.captureId = captureID;
      //TODO: Đổi trạng thái payment sang đã thành công
      order.invoice.payment.status = PaymentStatus.COMPLETED;
      //TODO: Đổi trạng thái invoice sang đã thanh toán
      order.invoice.status = InvoiceStatus.PAID;
      await Promise.all([
        this.placeOrder(order),
        this.paypalPaymentRepository.save(order.invoice.payment.paypalPayment),
        this.paymentRepository.save(order.invoice.payment),
        this.invoiceRepository.save(order.invoice),
      ]);

      return {
        status: HttpStatus.OK,
        message: 'Approve paypal order successfully',
      };
    } catch (error) {
      this.logger.error(error);
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message,
      };
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

  async placeOrder(order: Order) {
    order.status = OrdStatus.ORDERED;
    await this.orderRepository.save(order);
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
      console.log('FindOrder', orders);

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
}

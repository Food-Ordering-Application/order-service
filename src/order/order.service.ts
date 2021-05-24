import { SavePosOrderDto } from './dto/pos-order/save-pos-order.dto';
import { HttpStatus, Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NOTIFICATION_SERVICE } from 'src/constants';
import {
  AddNewItemToOrderDto,
  ApprovePaypalOrderDto,
  ConfirmOrderCheckoutDto,
  GetAllRestaurantOrderDto,
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
} from './enums';
import {
  IApprovePaypalOrder,
  IConfirmOrderCheckoutResponse,
  ICreateOrderResponse,
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
    @Inject(NOTIFICATION_SERVICE) private notiServiceClient: ClientProxy,
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
      order.grandTotal = order.subTotal;
      await this.orderRepository.save(order);
      // Nếu là order bên salechannel thì có customerId
      let newOrder;
      if (customerId) {
        // Tạo và lưu delivery
        const delivery = new Delivery();
        delivery.customerId = customerId;
        delivery.status = DeliveryStatus.DRAFT;
        delivery.restaurantGeom = restaurantGeom;
        delivery.restaurantAddress = restaurantAddress;

        /* Nếu customer có địa chỉ */
        if (customerGeom) {
          const { distance, shippingFee } = await calculateShippingFee(
            this.deliveryRepository,
            restaurantGeom,
            customerGeom,
          );
          delivery.customerGeom = customerGeom;
          delivery.customerAddress = customerAddress;
          delivery.shippingFee = shippingFee;
          delivery.distance = Math.floor(distance);
          order.grandTotal = order.subTotal + delivery.shippingFee;
        }

        delivery.order = order;
        await this.deliveryRepository.save(delivery);
        delete delivery.order;
        newOrder = { ...order, delivery: delivery };
      } else {
        // Nếu là order bên POS thì có cashierId
        order.cashierId = cashierId;
        order.grandTotal = order.subTotal;
      }
      const createdOrder = await this.orderRepository.save(order);
      console.log('Need to emit event message order to notification.');
      this.notiServiceClient.emit({ event: 'order_updated' }, createdOrder);
      return {
        status: HttpStatus.CREATED,
        message: 'Order created successfully',
        order: customerId ? newOrder : order,
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

  async getAllRestaurantOrder(
    getAllRestaurantOrderDto: GetAllRestaurantOrderDto,
  ): Promise<IOrdersResponse> {
    try {
      const {
        restaurantId,
        query,
        pageNumber,
        start,
        end,
      } = getAllRestaurantOrderDto;
      // Tìm lại order với orderId
      let orders;
      if (query === GetRestaurantOrder.ALL) {
        if (!start || !end || (!start && !end)) {
          orders = await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.delivery', 'delivery')
            .where('order.restaurantId = :restaurantId', {
              restaurantId: restaurantId,
            })
            .skip((pageNumber - 1) * 25)
            .take(25)
            .getMany();
        } else if (start && end) {
          const startDate = new Date(start);
          const endDate = new Date(end);
          orders = await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.delivery', 'delivery')
            .where('order.restaurantId = :restaurantId', {
              restaurantId: restaurantId,
            })
            .andWhere('order.createdAt >= :startDate', {
              startDate: startDate.toISOString(),
            })
            .andWhere('order.createdAt <= :endDate', {
              endDate: endDate.toISOString(),
            })
            .skip((pageNumber - 1) * 25)
            .take(25)
            .getMany();
        }
      } else if (query === GetRestaurantOrder.POS) {
        if (!start || !end || (!start && !end)) {
          orders = await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.delivery', 'delivery')
            .where('order.restaurantId = :restaurantId', {
              restaurantId: restaurantId,
            })
            .andWhere('delivery.id IS NULL')
            .skip((pageNumber - 1) * 25)
            .take(25)
            .getMany();
        } else if (start && end) {
          const startDate = new Date(start);
          const endDate = new Date(end);
          orders = await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.delivery', 'delivery')
            .where('order.restaurantId = :restaurantId', {
              restaurantId: restaurantId,
            })
            .andWhere('delivery.id IS NULL')
            .andWhere('order.createdAt >= :startDate', {
              startDate: startDate.toISOString(),
            })
            .andWhere('order.createdAt <= :endDate', {
              endDate: endDate.toISOString(),
            })
            .skip((pageNumber - 1) * 25)
            .take(25)
            .getMany();
        }
      } else {
        if (!start || !end || (!start && !end)) {
          orders = await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.delivery', 'delivery')
            .where('order.restaurantId = :restaurantId', {
              restaurantId: restaurantId,
            })
            .andWhere('delivery.id IS NOT NULL')
            .skip((pageNumber - 1) * 25)
            .take(25)
            .getMany();
        } else if (start && end) {
          const startDate = new Date(start);
          const endDate = new Date(end);
          orders = await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.delivery', 'delivery')
            .where('order.restaurantId = :restaurantId', {
              restaurantId: restaurantId,
            })
            .andWhere('delivery.id IS NOT NULL')
            .andWhere('order.createdAt >= :startDate', {
              startDate: startDate.toISOString(),
            })
            .andWhere('order.createdAt <= :endDate', {
              endDate: endDate.toISOString(),
            })
            .skip((pageNumber - 1) * 25)
            .take(25)
            .getMany();
        }
      }

      if (query === GetRestaurantOrder.SALE) {
        orders = orders.filter((order) => order.delivery !== null);
      }

      if (query === GetRestaurantOrder.POS) {
        orders = orders.filter((order) => order.delivery === null);
      }
      return {
        status: HttpStatus.OK,
        message: 'Restaurant orders fetched successfully',
        orders,
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
      //TODO: Update lại thông tin customerAddress, customerGeom và tính toán lại shippingFee của delivery
      order.delivery.customerAddress = address;
      order.delivery.customerGeom = geom;
      const { distance, shippingFee } = await calculateShippingFee(
        this.deliveryRepository,
        order.delivery.restaurantGeom,
        geom,
      );
      order.delivery.shippingFee = shippingFee;
      order.delivery.distance = Math.floor(distance);
      this.deliveryRepository.save(order.delivery);
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

  async confirmOrderCheckout(
    confirmOrderCheckoutDto: ConfirmOrderCheckoutDto,
  ): Promise<IConfirmOrderCheckoutResponse> {
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
      await Promise.all([
        this.invoiceRepository.save(invoice),
        this.orderRepository.save(order),
      ]);

      const payment = new Payment();
      payment.amount = calculateOrderGrandToTal(order);
      payment.invoice = invoice;
      payment.status = PaymentStatus.PENDING;
      payment.method = paymentMethod;
      await this.paymentRepository.save(payment);

      switch (paymentMethod) {
        case PaymentMethod.COD:
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
      //TODO: Đổi trạng thái order sang ORDERED
      order.status = OrdStatus.ORDERED;
      //TODO: Đổi trạng thái payment sang đã thành công
      order.invoice.payment.status = PaymentStatus.COMPLETED;
      //TODO: Đổi trạng thái invoice sang đã thanh toán
      order.invoice.status = InvoiceStatus.PAID;
      await Promise.all([
        this.orderRepository.save(order),
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
}

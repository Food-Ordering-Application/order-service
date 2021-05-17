import { SavePosOrderDto } from './dto/pos-order/save-pos-order.dto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AddNewItemToOrderDto,
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
  Delivery,
  Order,
  OrderItem,
  OrderItemTopping,
  Payment,
} from './entities';
import {
  OrdStatus,
  DeliveryStatus,
  GetRestaurantOrder,
  PaymentType,
  PaymentStatus,
} from './enums';
import {
  ICreateOrderResponse,
  IOrdersResponse,
  ISimpleResponse,
} from './interfaces';
import { createAndStoreOrderItem } from './helpers';
import {
  calculateOrderSubTotal,
  calculateOrderGrandToTal,
  findOrderItem,
  findOrderItemIndex,
  calculateShippingFee,
} from './helpers/order-logic.helper';

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
      await this.orderRepository.save(order);
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
  ): Promise<ISimpleResponse> {
    try {
      const {
        note,
        paymentType,
        orderId,
        customerId,
      } = confirmOrderCheckoutDto;

      //TODO: Lấy thông tin order
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.delivery', 'delivery')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where('order.id = :orderId', {
          orderId: orderId,
        })
        .getOne();
      //TODO: Nếu order đó ko phải do customer tạo order đó checkout (Authorization)
      if (order.delivery.customerId !== customerId) {
        return {
          status: HttpStatus.FORBIDDEN,
          message: 'Forbidden',
        };
      }

      //TODO: Thêm note cho order nếu có
      if (note) {
        order.note = note;
        this.orderRepository.save(order);
      }
      //TODO: Tạo payment entity với phương thức thanh toán
      const payment = new Payment();
      payment.amount = calculateOrderGrandToTal(order);
      payment.order = order;
      payment.status = PaymentStatus.PENDING;
      payment.type = paymentType;
      this.paymentRepository.save(payment);

      switch (paymentType) {
        case PaymentType.COD:
          break;
        case PaymentType.PAYPAL:
          break;
        case PaymentType.VISA_MASTERCARD:
          break;
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

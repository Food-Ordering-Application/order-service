import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AddNewItemToOrderDto,
  GetOrderAssociatedWithCusAndResDto,
  IncreaseOrderItemQuantityDto,
  ReduceOrderItemQuantityDto,
  RemoveOrderItemDto,
} from './dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { Delivery, Order, OrderItem, OrderItemTopping } from './entities';
import { PType, OrdStatus, DeliveryStatus } from './enums';
import { ICreateOrderResponse } from './interfaces';
import { createAndStoreOrderItem } from './helpers';
import {
  calculateGrandTotal,
  calculateSubTotal,
  findOrderItem,
  findOrderItemIndex,
  calculateDeliveryTotal,
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
  ) {}

  async createOrderAndFirstOrderItem(
    createOrderDto: CreateOrderDto,
  ): Promise<ICreateOrderResponse> {
    const { orderItem, restaurantId, customerId, cashierId } = createOrderDto;
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
      // paymentType mặc định là COD, status là DRAFT
      order.paymentType = PType.COD;
      order.status = OrdStatus.DRAFT;
      order.orderItems = addOrderItems;
      order.serviceFee = 2000;
      order.subTotal =
        (orderItem.price + totalPriceToppings) * orderItem.quantity;
      order.grandTotal = order.serviceFee + order.subTotal;
      await this.orderRepository.save(order);

      // Nếu là order bên salechannel thì có customerId
      if (customerId) {
        // Tạo và lưu delivery
        const delivery = new Delivery();
        delivery.customerId = customerId;
        delivery.status = DeliveryStatus.WAITING_DRIVER;
        delivery.shippingFee = 15000;
        delivery.total = order.grandTotal + delivery.shippingFee;
        await this.deliveryRepository.save(delivery);
      } else {
        // Nếu là order bên POS thì có cashierId
        order.cashierId = cashierId;
        await this.orderRepository.save(order);
      }

      return {
        status: HttpStatus.CREATED,
        message: 'Order created successfully',
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

  async getOrderAssociatedWithCusAndRes(
    getOrderAssociatedWithCusAndResDto: GetOrderAssociatedWithCusAndResDto,
  ): Promise<ICreateOrderResponse> {
    try {
      const { customerId, restaurantId } = getOrderAssociatedWithCusAndResDto;
      const order = await this.orderRepository
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.orderItems', 'ordItems')
        .leftJoinAndSelect('ordItems.orderItemToppings', 'ordItemToppings')
        .where(
          'order.restaurantId = :restaurantId AND order.customerId = :customerId',
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
      // Nếu item gửi lên orderItem đã có sẵn và  giống y chang topping trong order thì tăng số lượng orderItem đã có sẵn
      if (foundOrderItem) {
        foundOrderItem.quantity += sendItem.quantity;
        await this.orderItemRepository.save(foundOrderItem);
        order.orderItems[foundOrderItemIndex] = foundOrderItem;
        // Tính toán lại giá
        order.subTotal = calculateSubTotal(order.orderItems);
        order.grandTotal = calculateGrandTotal(order);
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
        order.grandTotal += totalOrderItemPrice;
      }
      // Lưu lại order
      await this.orderRepository.save(order);
      // Nếu trường delivery không falsy tức là order bên salechannel
      if (order.delivery) {
        order.delivery.total = calculateDeliveryTotal(order);
        await this.deliveryRepository.save(order.delivery);
      }
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
          await this.orderRepository.remove(order);
          if (order.delivery) {
            await this.deliveryRepository.remove(order.delivery);
          }
        } else {
          order.subTotal = calculateSubTotal(order.orderItems);
          order.grandTotal = calculateGrandTotal(order);
          order.delivery.total = calculateDeliveryTotal(order);
          await Promise.all([
            this.orderRepository.save(order),
            this.orderItemRepository.remove(orderItem),
            this.deliveryRepository.save(order.delivery),
          ]);
        }
      } else {
        const orderItemIndex = order.orderItems.findIndex(
          (item) => item.id === orderItemId,
        );
        order.orderItems[orderItemIndex] = orderItem;
        order.subTotal = calculateSubTotal(order.orderItems);
        order.grandTotal = calculateGrandTotal(order);
        order.delivery.total = calculateDeliveryTotal(order);
        await Promise.all([
          this.orderItemRepository.save(orderItem),
          this.orderRepository.save(order),
          this.deliveryRepository.save(order.delivery),
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
      order.subTotal = calculateSubTotal(order.orderItems);
      order.grandTotal = calculateGrandTotal(order);
      if (order.delivery) {
        order.delivery.total = calculateDeliveryTotal(order);
        await Promise.all([
          this.orderItemRepository.save(orderItem),
          this.orderRepository.save(order),
          this.deliveryRepository.save(order.delivery),
        ]);
      } else {
        await Promise.all([
          this.orderItemRepository.save(orderItem),
          this.orderRepository.save(order),
        ]);
      }

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
        await this.orderRepository.remove(order);
      } else {
        // Tính toán lại giá
        order.subTotal = calculateSubTotal(order.orderItems);
        order.grandTotal = calculateGrandTotal(order);
        await this.orderRepository.save(order);
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
}

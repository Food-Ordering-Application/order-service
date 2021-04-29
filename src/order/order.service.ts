import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AddNewItemToOrderDto,
  GetOrderAssociatedWithCusAndResDto,
  IncreaseOrderItemQuantityDto,
  ReduceOrderItemQuantityDto,
} from './dto';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  Order,
  OrderItem,
  OrderItemTopping,
  OrderStatus,
  PaymentType,
} from './entities';
import { PType, Status } from './enums';
import { ICreateOrderResponse } from './interfaces';
import { createAndStoreOrderItem } from './helpers';
import {
  calculateGrandTotal,
  calculateSubTotal,
  findOrderItem,
  findOrderItemIndex,
} from './helpers/order-logic.helper';

@Injectable()
export class OrderService {
  private readonly logger = new Logger('OrderService');

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(OrderItemTopping)
    private orderItemToppingRepository: Repository<OrderItemTopping>,
    @InjectRepository(PaymentType)
    private paymentTypeRepository: Repository<PaymentType>,
    @InjectRepository(OrderStatus)
    private orderStatusRepository: Repository<OrderStatus>,
  ) {}

  async createOrderAndFirstOrderItem(
    createOrderDto: CreateOrderDto,
  ): Promise<ICreateOrderResponse> {
    const { orderItem, restaurantId, customerId } = createOrderDto;
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
      order.customerId = customerId;
      order.restaurantId = restaurantId;
      // paymentType mặc định là COD, status là DRAFT
      const values = await Promise.all([
        this.paymentTypeRepository.findOne({
          name: PType.COD,
        }),
        this.orderStatusRepository.findOne({
          name: Status.DRAFT,
        }),
      ]);
      order.paymentType = values[0];
      order.status = values[1];
      order.orderItems = addOrderItems;
      order.serviceFee = 2000;
      order.shippingFee = 15000;
      order.subTotal =
        orderItem.price * orderItem.quantity + totalPriceToppings;
      order.grandTotal = order.serviceFee + order.shippingFee + order.subTotal;
      await this.orderRepository.save(order);
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
      } else if (!foundOrderItem) {
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
        console.log(newOrderItems);
        if (newOrderItems.length === 0) {
          flag = 1;
          console.log('REMOVE ORDERITEM');
          console.log('REMOVE ORDER');
          await this.orderItemRepository.remove(orderItem);
          await this.orderRepository.remove(order);
        } else {
          order.subTotal = calculateSubTotal(order.orderItems);
          order.grandTotal = calculateGrandTotal(order);
          console.log('REMOVE ORDERITEM');
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
        order.subTotal = calculateSubTotal(order.orderItems);
        order.grandTotal = calculateGrandTotal(order);

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
}

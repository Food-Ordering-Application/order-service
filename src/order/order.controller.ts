import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OrderService } from './order.service';
import {
  AddNewItemToOrderDto,
  CreateOrderDto,
  GetAllRestaurantOrderDto,
  GetOrderAssociatedWithCusAndResDto,
  IncreaseOrderItemQuantityDto,
  ReduceOrderItemQuantityDto,
  RemoveOrderItemDto,
} from './dto';
import { ICreateOrderResponse, IOrdersResponse } from './interfaces';
import { GetOrderDetailDto } from './dto/get-order-detail.dto';

@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @MessagePattern('createOrderAndFirstOrderItem')
  async createOrderAndFirstOrderItem(
    @Payload() createOrderDto: CreateOrderDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.createOrderAndFirstOrderItem(createOrderDto);
  }

  @MessagePattern('getOrderAssociatedWithCusAndRes')
  async getOrderAssociatedWithCusAndRes(
    @Payload()
    getOrderAssociatedWithCusAndResDto: GetOrderAssociatedWithCusAndResDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.getOrderAssociatedWithCusAndRes(
      getOrderAssociatedWithCusAndResDto,
    );
  }

  @MessagePattern('addNewItemToOrder')
  async addNewItemToOrder(
    @Payload()
    addNewItemToOrder: AddNewItemToOrderDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.addNewItemToOrder(addNewItemToOrder);
  }

  @MessagePattern('reduceOrderItemQuantity')
  async reduceOrderItemQuantity(
    @Payload()
    reduceOrderItemQuantityDto: ReduceOrderItemQuantityDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.reduceOrderItemQuantity(
      reduceOrderItemQuantityDto,
    );
  }

  @MessagePattern('increaseOrderItemQuantity')
  async increaseOrderItemQuantity(
    @Payload()
    increaseOrderItemQuantityDto: IncreaseOrderItemQuantityDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.increaseOrderItemQuantity(
      increaseOrderItemQuantityDto,
    );
  }

  @MessagePattern('removeOrderItem')
  async removeOrderItem(
    @Payload()
    removeOrderItemDto: RemoveOrderItemDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.removeOrderItem(removeOrderItemDto);
  }

  @MessagePattern('getAllRestaurantOrder')
  async getAllRestaurantOrder(
    @Payload()
    getAllRestaurantOrderDto: GetAllRestaurantOrderDto,
  ): Promise<IOrdersResponse> {
    return this.orderService.getAllRestaurantOrder(getAllRestaurantOrderDto);
  }

  @MessagePattern('getOrderDetail')
  async getOrderDetail(
    @Payload()
    getOrderDetailDto: GetOrderDetailDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.getOrderDetail(getOrderDetailDto);
  }
}

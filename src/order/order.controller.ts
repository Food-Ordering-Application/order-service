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
  SavePosOrderDto,
  UpdateDeliveryAddressDto,
  UpdateOrderItemQuantityDto,
  GetOrderDetailDto,
  ConfirmOrderCheckoutDto,
  ApprovePaypalOrderDto,
  GetListOrderOfDriverDto,
  GetOrdersOfCustomerDto,
  GetOrderHistoryOfCustomerDto,
  EventPaypalOrderOccurDto,
  GetLastDraftOrderOfCustomerDto,
  GetOrderStatisticsOfRestaurantDto,
  GetRevenueInsightOfRestaurantDto,
} from './dto';
import {
  ICreateOrderResponse,
  IOrdersResponse,
  ISaveOrderResponse,
  IConfirmOrderCheckoutResponse,
  IApprovePaypalOrder,
  ICustomerOrdersResponse,
  IRestaurantStatisticResponse,
} from './interfaces';
import { EventPattern } from '@nestjs/microservices';
import { GetRestaurantStatisticDto } from './dto/get-restaurant-statistic.dto';

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

  @MessagePattern('getOrdersOfRestaurant')
  async getAllRestaurantOrder(
    @Payload()
    getAllRestaurantOrderDto: GetAllRestaurantOrderDto,
  ): Promise<IOrdersResponse> {
    return this.orderService.getOrdersOfRestaurant(getAllRestaurantOrderDto);
  }

  @MessagePattern('getOrderDetail')
  async getOrderDetail(
    @Payload()
    getOrderDetailDto: GetOrderDetailDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.getOrderDetail(getOrderDetailDto);
  }

  @MessagePattern('updateOrderItemQuantity')
  async updateOrderItemQuantity(
    @Payload()
    updateOrderItemQuantityDto: UpdateOrderItemQuantityDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.updateOrderItemQuantity(
      updateOrderItemQuantityDto,
    );
  }

  @MessagePattern('updateDeliveryAddress')
  async updateDeliveryAddress(
    @Payload()
    updateDeliveryAddressDto: UpdateDeliveryAddressDto,
  ): Promise<ICreateOrderResponse> {
    return this.orderService.updateDeliveryAddress(updateDeliveryAddressDto);
  }

  @MessagePattern('confirmOrderCheckout')
  async confirmOrderCheckout(
    @Payload()
    confirmOrderCheckoutDto: ConfirmOrderCheckoutDto,
  ): Promise<IConfirmOrderCheckoutResponse> {
    return this.orderService.confirmOrderCheckout(confirmOrderCheckoutDto);
  }

  @MessagePattern('approvePaypalOrder')
  async approvePaypalOrder(
    @Payload()
    approvePaypalOrderDto: ApprovePaypalOrderDto,
  ): Promise<IApprovePaypalOrder> {
    return this.orderService.approvePaypalOrder(approvePaypalOrderDto);
  }

  @MessagePattern('savePosOrder')
  async savePosOrder(
    @Payload()
    savePosOrderDto: SavePosOrderDto,
  ): Promise<ISaveOrderResponse> {
    return this.orderService.savePosOrder(savePosOrderDto);
  }

  //! Get one order ON_GOING, PICKED_UP of driver
  @MessagePattern('getListOrderOfDriver')
  async getListOrderOfDriver(
    @Payload()
    getListOrderOfDriverDto: GetListOrderOfDriverDto,
  ): Promise<IOrdersResponse> {
    return this.orderService.getListOrderOfDriver(getListOrderOfDriverDto);
  }

  @MessagePattern('getOnGoingOrdersOfCustomer')
  async getOnGoingOrderOfCustomer(
    @Payload()
    getOrdersOfCustomerDto: GetOrdersOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    return this.orderService.getOnGoingOrdersOfCustomer(getOrdersOfCustomerDto);
  }

  @MessagePattern('getOrderHistoryOfCustomer')
  async getOrderHistoryOfCustomer(
    @Payload()
    getOrderHistoryOfCustomerDto: GetOrderHistoryOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    return this.orderService.getOrderHistoryOfCustomer(
      getOrderHistoryOfCustomerDto,
    );
  }

  @MessagePattern('getDraftOrdersOfCustomer')
  async getDraftOrdersOfCustomer(
    @Payload()
    getOrdersOfCustomerDto: GetOrdersOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    return this.orderService.getDraftOrdersOfCustomer(getOrdersOfCustomerDto);
  }

  @MessagePattern('getLastDraftOrderOfCustomer')
  async getLastDraftOrderOfCustomer(
    @Payload()
    getLastDraftOrderOfCustomerDto: GetLastDraftOrderOfCustomerDto,
  ): Promise<ICustomerOrdersResponse> {
    return this.orderService.getLastDraftOrderOfCustomer(
      getLastDraftOrderOfCustomerDto,
    );
  }

  @EventPattern('eventPaypalOrderOccur')
  async eventPaypalOrderOccur(
    @Payload()
    eventPaypalOrderOccurDto: EventPaypalOrderOccurDto,
  ) {
    this.orderService.eventPaypalOrderOccur(eventPaypalOrderOccurDto);
  }

  //! Thống kê order restaurant
  @MessagePattern('getRestaurantStatistic')
  async getRestaurantStatistic(
    @Payload()
    getRestaurantStatisticDto: GetRestaurantStatisticDto,
  ): Promise<IRestaurantStatisticResponse> {
    return this.orderService.getRestaurantStatistic(getRestaurantStatisticDto);
  }

  @MessagePattern('getOrderStatisticsOfRestaurant')
  async getOrderStatisticsOfRestaurant(
    @Payload()
    getOrderStatisticsOfRestaurantDto: GetOrderStatisticsOfRestaurantDto,
  ) {
    return this.orderService.getOrderStatisticsOfRestaurant(
      getOrderStatisticsOfRestaurantDto,
    );
  }

  @MessagePattern('getRevenueInsightOfRestaurant')
  async getRevenueInsightOfRestaurant(
    getRevenueInsightOfRestaurantDto: GetRevenueInsightOfRestaurantDto,
  ) {
    return this.orderService.getRevenueInsightOfRestaurant(
      getRevenueInsightOfRestaurantDto,
    );
  }
}

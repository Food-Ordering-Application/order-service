import { IRestaurantVoidOrderResponse } from './interfaces/restaurant-void-order-response.interface';
import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  DriverCompleteOrderDto,
  DriverPickedUpOrderDto,
  RestaurantConfirmOrderDto,
  RestaurantVoidOrderDto,
  UpdateDriverForOrderEventPayload,
} from './dto';
import {
  IDriverCompleteOrderResponse,
  IDriverPickedUpOrderResponse,
  IRestaurantConfirmOrderResponse,
} from './interfaces';
import { OrderFulfillmentService } from './order-fulfillment.service';

@Controller()
export class OrderFulfillmentController {
  constructor(
    private readonly orderFulfillmentService: OrderFulfillmentService,
  ) {}

  @MessagePattern('restaurantConfirmOrder')
  async restaurantConfirmOrder(
    @Payload()
    restaurantConfirmOrderDto: RestaurantConfirmOrderDto,
  ): Promise<IRestaurantConfirmOrderResponse> {
    return this.orderFulfillmentService.restaurantConfirmOrder(
      restaurantConfirmOrderDto,
    );
  }

  @EventPattern('updateDriverForOrderEvent')
  async handleUpdateDriverForOrder(
    @Payload()
    updateDriverForOrderDto: UpdateDriverForOrderEventPayload,
  ) {
    return this.orderFulfillmentService.handleUpdateDriverForOrder(
      updateDriverForOrderDto,
    );
  }

  @MessagePattern('driverPickedUpOrder')
  async driverPickedUpOrder(
    @Payload()
    driverPickedUpOrderDto: DriverPickedUpOrderDto,
  ): Promise<IDriverPickedUpOrderResponse> {
    return this.orderFulfillmentService.driverPickedUpOrder(
      driverPickedUpOrderDto,
    );
  }

  @MessagePattern('driverCompleteOrder')
  async driverCompleteOrder(
    @Payload()
    driverCompleteOrderDto: DriverCompleteOrderDto,
  ): Promise<IDriverCompleteOrderResponse> {
    return this.orderFulfillmentService.driverCompleteOrder(
      driverCompleteOrderDto,
    );
  }

  @MessagePattern('restaurantVoidOrder')
  async restaurantVoidOrder(
    @Payload()
    restaurantVoidOrderDto: RestaurantVoidOrderDto,
  ): Promise<IRestaurantVoidOrderResponse> {
    return this.orderFulfillmentService.restaurantVoidOrder(
      restaurantVoidOrderDto,
    );
  }
}

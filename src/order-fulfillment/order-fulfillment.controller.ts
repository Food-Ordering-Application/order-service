import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import {
  RestaurantConfirmOrderDto,
  UpdateDriverForOrderEventPayload,
} from './dto';
import { IRestaurantConfirmOrderResponse } from './interfaces';
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

  @EventPattern('updateDriverForOrder')
  async handleUpdateDriverForOrder(
    @Payload()
    updateDriverForOrderDto: UpdateDriverForOrderEventPayload,
  ) {
    return this.orderFulfillmentService.handleUpdateDriverForOrder(
      updateDriverForOrderDto,
    );
  }
}

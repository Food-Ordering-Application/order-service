import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OrderFulfillmentService } from './order-fulfillment.service';

@Controller()
export class OrderFulfillmentController {
  constructor(
    private readonly orderFulfillmentService: OrderFulfillmentService,
  ) {}

  @MessagePattern('createOrderAndFirstOrderItem')
  async createOrderAndFirstOrderItem(@Payload() createOrderDto: any) {
    // return this.orderFulfillmentService.createOrderAndFirstOrderItem(
    //   createOrderDto,
    // );
    return null;
  }
}

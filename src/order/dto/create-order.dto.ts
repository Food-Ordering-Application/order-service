import { OrderItem } from './index';

export class CreateOrderDto {
  orderItem: OrderItem;
  restaurantId: string;
  customerId: string;
}

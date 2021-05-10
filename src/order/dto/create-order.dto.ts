import { OrderItem } from './index';

export class CreateOrderDto {
  orderItem: OrderItem;
  restaurantId: string;
  customerId?: string;
  cashierId?: string;
  restaurantGeom?: { type: string; coordinates: number[] };
  customerGeom?: { type: string; coordinates: number[] };
}

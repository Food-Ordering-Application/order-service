import { OrderItem } from './index';

export class CreateOrderDto {
  orderItem: OrderItem;
  customer?: {
    customerId?: string;
    customerAddress: string;
    customerGeom?: { type: string; coordinates: number[] };
    customerName: string;
    customerPhoneNumber: string;
  };
  restaurant: {
    restaurantId: string;
    restaurantGeom?: { type: string; coordinates: number[] };
    restaurantAddress: string;
    restaurantName: string;
    restaurantPhoneNumber: string;
  };
  cashierId?: string;
}

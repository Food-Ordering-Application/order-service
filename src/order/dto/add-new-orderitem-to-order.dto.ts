import { OrderItem } from './order-item.dto';

export class AddNewItemToOrderDto {
  sendItem: OrderItem;
  orderId: string;
}

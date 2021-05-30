export class RestaurantVoidOrderDto {
  orderId: string;
  cashierId: string;
  restaurantId: string;
  orderItemIds: string[];
  cashierNote: string;
}

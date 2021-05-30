import { OrdStatus } from '../enums';

export class GetAllRestaurantOrderDto {
  restaurantId: string;
  query: string;
  pageNumber: number;
  orderStatus: OrdStatus;
  start?: string;
  end?: string;
}

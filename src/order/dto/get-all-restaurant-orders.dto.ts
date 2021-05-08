export class GetAllRestaurantOrderDto {
  restaurantId: string;
  query: string;
  pageNumber: number;
  start?: string;
  end?: string;
}

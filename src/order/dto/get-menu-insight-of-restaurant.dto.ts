import { MenuInsightSortBy } from '../enums';

export class GetMenuInsightOfRestaurantDto {
  restaurantId: string;
  from: string;
  to: string;
  sortBy: MenuInsightSortBy;
  limit: number;
}

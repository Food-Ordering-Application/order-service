import { GroupByInterval } from '../enums';

export class GetOrderStatisticsOfRestaurantDto {
  restaurantId: string;
  from: string;
  to: string;
  groupByInterval: GroupByInterval;
}

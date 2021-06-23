import * as moment from 'moment-timezone';

export class RestaurantOrderStatisticsDto {
  columnName: string;

  allOrderCount: number;
  allOrderTotalRevenue: number;

  saleOrderCount: number;
  saleOrderTotalRevenue: number;

  posOrderCount: number;
  posOrderTotalRevenue: number;

  static getPropName(): IRestaurantOrderStatistics {
    return {
      columnName: 'columnName',
      allOrderCount: 'allOrderCount',
      allOrderTotalRevenue: 'allOrderTotalRevenue',

      saleOrderCount: 'saleOrderCount',
      saleOrderTotalRevenue: 'saleOrderTotalRevenue',

      posOrderCount: 'posOrderCount',
      posOrderTotalRevenue: 'posOrderTotalRevenue',
    };
  }

  static convertToDTO(
    raw: RestaurantOrderStatisticsDto,
  ): RestaurantOrderStatisticsDto {
    const utc = raw.columnName;
    const vietnam_day = moment(utc).tz('Asia/Ho_Chi_Minh').format('DD-MM');
    // console.log({ utc, result });
    return { ...raw, columnName: vietnam_day };
  }
}

export interface IRestaurantOrderStatistics {
  columnName: string;

  allOrderCount: string;
  allOrderTotalRevenue: string;

  saleOrderCount: string;
  saleOrderTotalRevenue: string;

  posOrderCount: string;
  posOrderTotalRevenue: string;
}

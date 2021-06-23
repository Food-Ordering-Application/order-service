import * as moment from 'moment-timezone';
import { PERCENT_PLATFORM_FEE } from '../constants';

export class RestaurantRevenueInsightDto {
  allOrderCount: number;
  allOrderTotalRevenue: number;

  saleOrderCount: number;
  saleOrderTotalRevenue: number;

  saleCODOrderCount: number;
  saleCODOrderTotalRevenue: number;

  saleOnlineOrderCount: number;
  saleOnlineOrderTotalRevenue: number;

  posOrderCount: number;
  posOrderTotalRevenue: number;

  actualRevenue?: number;
  feeTotal?: number;
  feePaid?: number;
  feeBilling?: number;

  static getPropName(): IRestaurantRevenueInsight {
    return {
      allOrderCount: 'allOrderCount',
      allOrderTotalRevenue: 'allOrderTotalRevenue',

      saleOrderCount: 'saleOrderCount',
      saleOrderTotalRevenue: 'saleOrderTotalRevenue',

      saleCODOrderCount: 'saleCODOrderCount',
      saleCODOrderTotalRevenue: 'saleCODOrderTotalRevenue',

      saleOnlineOrderCount: 'saleOnlineOrderCount',
      saleOnlineOrderTotalRevenue: 'saleOnlineOrderTotalRevenue',

      posOrderCount: 'posOrderCount',
      posOrderTotalRevenue: 'posOrderTotalRevenue',
    };
  }

  static convertToDTO(
    raw: RestaurantRevenueInsightDto,
  ): RestaurantRevenueInsightDto {
    if (!raw) {
      return null;
    }
    Object.keys(raw).forEach((key) => (raw[key] = parseInt(raw[key])));
    const {
      posOrderTotalRevenue,
      saleCODOrderTotalRevenue,
      saleOrderTotalRevenue,
    } = raw;
    /*
      doanh thu tổng = grandtotal đơn pos + (đơn sale paypal + đơn sale cod)
      doanh thu thực nhận = grandtotal đơn pos + 80% * (đơn sale paypal + đơn sale cod)
      Chi phí vận hành cần trả = 20% * đơn sale cod
    */
    const actualRevenue =
      posOrderTotalRevenue + (1 - PERCENT_PLATFORM_FEE) * saleOrderTotalRevenue;
    const feePercent = PERCENT_PLATFORM_FEE;

    const feeTotal = feePercent * saleOrderTotalRevenue;
    const feeBilling = saleCODOrderTotalRevenue * feePercent;
    const feePaid = feeTotal - feeBilling;

    return { actualRevenue, feeTotal, feePaid, feeBilling, ...raw };
  }
}

export interface IRestaurantRevenueInsight {
  allOrderCount: string;
  allOrderTotalRevenue: string;

  saleOrderCount: string;
  saleOrderTotalRevenue: string;

  saleCODOrderCount: string;
  saleCODOrderTotalRevenue: string;

  saleOnlineOrderCount: string;
  saleOnlineOrderTotalRevenue: string;

  posOrderCount: string;
  posOrderTotalRevenue: string;
}

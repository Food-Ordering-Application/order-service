export class RestaurantMenuInsightDto {
  menuItemId: string;

  allOrderCount: number;
  allOrderTotalQuantities: number;

  saleOrderCount: number;
  saleOrderTotalQuantities: number;

  posOrderCount: number;
  posOrderTotalQuantities: number;

  static getPropName(): IRestaurantMenuInsight {
    return {
      menuItemId: 'menuItemId',

      allOrderCount: 'allOrderCount',
      allOrderTotalQuantities: 'allOrderTotalQuantities',

      saleOrderCount: 'saleOrderCount',
      saleOrderTotalQuantities: 'saleOrderTotalQuantities',

      posOrderCount: 'posOrderCount',
      posOrderTotalQuantities: 'posOrderTotalQuantities',
    };
  }

  static convertToDTO(raw: RestaurantMenuInsightDto): RestaurantMenuInsightDto {
    Object.keys(raw)
      .filter((key) => key != RestaurantMenuInsightDto.getPropName().menuItemId)
      .forEach((key) => (raw[key] = parseInt(raw[key])));

    return { ...raw };
  }
}

export interface IRestaurantMenuInsight {
  menuItemId: string;

  allOrderCount: string;
  allOrderTotalQuantities: string;

  saleOrderCount: string;
  saleOrderTotalQuantities: string;

  posOrderCount: string;
  posOrderTotalQuantities: string;
}

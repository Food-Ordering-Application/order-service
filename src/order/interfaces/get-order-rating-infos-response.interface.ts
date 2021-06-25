export class IGetOrderRatingInfosResponse {
  status: number;
  message: string;
  data: {
    restaurantId: string;
    driverId: string;
    deliveredAt: Date;
  };
}

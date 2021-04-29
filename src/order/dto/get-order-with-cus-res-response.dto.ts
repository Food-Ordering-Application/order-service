import { IOrderData } from '../interfaces';

export class GetOrderAssociatedWithCusAndResResponseDto {
  statusCode: number;
  message: string;
  data: IOrderData;
}

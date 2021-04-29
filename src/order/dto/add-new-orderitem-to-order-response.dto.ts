import { IOrderData } from '../interfaces';

export class AddNewItemToOrderResponseDto {
  statusCode: number;
  message: string;
  data: IOrderData;
}

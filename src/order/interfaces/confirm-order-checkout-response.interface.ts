export interface IConfirmOrderCheckoutResponse {
  status: number;
  message: string;
  paypalOrderId?: string;
  orderUrl?: string;
}

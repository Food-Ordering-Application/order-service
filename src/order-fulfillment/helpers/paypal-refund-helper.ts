import * as paypal from '@paypal/checkout-server-sdk';
import { client } from 'src/config/paypal';
import { PayPalRefundStatus } from 'src/order/enums';

interface RefundAPIResponse {
  refundId: string;
  status: PayPalRefundStatus;
}

const refund = async (captureId: string): Promise<RefundAPIResponse> => {
  const request = new paypal.payments.CapturesRefundRequest(captureId);
  request.headers['PayPal-Partner-Attribution-Id'] =
    process.env.PAYPAL_PARTNER_ATTRIBUTION_ID;
  request.prefer('return=minimal');
  request.requestBody({});

  try {
    const refundResponse: RefundAPIResponse = await client().execute(request);
    const { refundId, status } = refundResponse;
    return { refundId, status };
  } catch (e) {
    return null;
  }
};

export const PayPalClient = {
  refund,
};

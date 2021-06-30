import * as paypal from '@paypal/checkout-server-sdk';
import { client } from 'src/config/paypal';
import { PayPalRefundStatus } from 'src/order/enums';

interface RefundAPIResponse {
  result: {
    id: string;
    status: PayPalRefundStatus;
  };
}
interface RefundResponse {
  refundId: string;
  status: PayPalRefundStatus;
}

const refund = async (
  captureId: string,
  merchantPayPalId: string,
): Promise<RefundResponse> => {
  const request = new paypal.payments.CapturesRefundRequest(captureId);
  // request.headers['PayPal-Partner-Attribution-Id'] =
  //   process.env.PAYPAL_PARTNER_ATTRIBUTION_ID;
  const btoa = (str: string) => Buffer.from(str).toString('base64');
  const clientId =
    'AYjFOtWDPPiV4-pDqDJYYIc8SZ_ibBLIkA8YA_7xONnCxXehuudFG2wl99eWqcrNQokzsjCvvRd7RB-W';
  const auth_1 = btoa('{"alg":"none"}');
  const auth_2 = btoa(`{"payer_id":${merchantPayPalId},"iss":${clientId}}`);
  const auth_assertion_header = auth_1 + '.' + auth_2 + '.';

  request.headers['PayPal-Auth-Assertion'] = auth_assertion_header;
  request.prefer('return=minimal');
  request.requestBody({});

  console.log(
    `refund, captureId: ${captureId}, partnerId: ${process.env.PAYPAL_PARTNER_ATTRIBUTION_ID}, ${auth_assertion_header}`,
  );
  try {
    const refundResponse: RefundAPIResponse = await client().execute(request);
    console.log({ refundResponse });
    const { result } = refundResponse;
    const { id, status } = result;
    return { refundId: id, status };
  } catch (e) {
    console.log('Refund Error: ', e.message);
    return null;
  }
};

export const PayPalClient = {
  refund,
};

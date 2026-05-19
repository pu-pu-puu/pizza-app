import axios from 'axios';

/**
 * Subset of the YooKassa refund object we rely on for reconciliation.
 * Full schema: https://yookassa.ru/developers/api#refund_object
 */
export type YookassaRefund = {
  id: string;
  status: 'pending' | 'succeeded' | 'canceled' | (string & {});
  amount: { value: string; currency: 'RUB' };
  payment_id: string;
};

/**
 * Fetches the current state of a refund from YooKassa. Used by the
 * reconciliation cron when a webhook for a previously-PENDING refund
 * never arrived. Throws on non-2xx so the caller can decide whether
 * to retry the row or surface the error.
 */
export async function getYookassaRefund(
  refundId: string,
): Promise<YookassaRefund> {
  const { data } = await axios.get<YookassaRefund>(
    `https://api.yookassa.ru/v3/refunds/${refundId}`,
    {
      auth: {
        username: process.env.YOOKASSA_STORE_ID as string,
        password: process.env.YOOKASSA_API_KEY as string,
      },
    },
  );

  return data;
}

import { SmsSender } from './sender';

const ENDPOINT = 'https://gatewayapi.telegram.org/sendVerificationMessage';

/**
 * Telegram Gateway provider.
 *
 * Free when the recipient is the Telegram account that owns the gateway token
 * (used for testing). Paid otherwise — billed in TON via Fragment.
 *
 * Docs: https://core.telegram.org/gateway/api#sendverificationmessage
 */
export const telegramGatewaySender: SmsSender = {
  async sendCode(phone, code) {
    const token = process.env.TELEGRAM_GATEWAY_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_GATEWAY_TOKEN is not set');
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone_number: phone,
        code,
        // 5 min — same as our DB TTL. If undelivered within ttl Gateway refunds.
        ttl: 300,
      }),
    });

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new Error(
        `Telegram Gateway returned non-JSON (HTTP ${res.status})`
      );
    }

    const body = payload as { ok?: boolean; error?: string };
    if (!body.ok) {
      throw new Error(
        `Telegram Gateway error: ${body.error ?? 'unknown'} (HTTP ${res.status})`
      );
    }
  },
};

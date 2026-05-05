/**
 * Provider-agnostic interface for sending one-time codes to a phone.
 *
 * In dev mode (TELEGRAM_GATEWAY_DEV_LOG_ONLY=1) the sender just logs the code
 * to the server console — no real delivery, no money spent. Useful for local
 * testing and CI.
 *
 * In prod (TELEGRAM_GATEWAY_TOKEN set) we send via Telegram Gateway:
 *   https://core.telegram.org/gateway/api
 */
export interface SmsSender {
  /**
   * Send a verification code to the given phone (E.164 format, e.g. "+79991234567").
   * Throws if the underlying provider fails (network, API rejection, etc.).
   */
  sendCode(phone: string, code: string): Promise<void>;
}

import { devLogSender } from './dev-log';
import { telegramGatewaySender } from './telegram-gateway';

let cached: SmsSender | null = null;

export function getSmsSender(): SmsSender {
  if (cached) return cached;

  const devOnly = process.env.TELEGRAM_GATEWAY_DEV_LOG_ONLY === '1';
  const token = process.env.TELEGRAM_GATEWAY_TOKEN;

  if (devOnly || !token) {
    cached = devLogSender;
  } else {
    cached = telegramGatewaySender;
  }

  return cached;
}

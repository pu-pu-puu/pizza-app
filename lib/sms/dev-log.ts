import { SmsSender } from './sender';
import { maskPhone } from '../phone';

export const devLogSender: SmsSender = {
  async sendCode(phone, code) {
    // Loud logging so the code is easy to spot in `npm run dev` output / CI logs.
    // The masked phone hides the middle digits, but the actual code is plain
    // text by design — this sender must never be enabled in production.
    console.log(
      '\n[OTP dev-log] To: %s  |  Code: %s  |  TTL: 5 min\n',
      maskPhone(phone),
      code
    );
  },
};

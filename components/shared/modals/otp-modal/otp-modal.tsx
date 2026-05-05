'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button, Input } from '@/components/ui';
import React from 'react';
import toast from 'react-hot-toast';
import { signIn, useSession } from 'next-auth/react';
import { maskPhone } from '@/lib/phone';

interface Props {
  open: boolean;
  phone: string;
  onClose: () => void;
  onVerified: () => void;
}

const RESEND_COOLDOWN_SEC = 60;

async function requestSendCode(phone: string) {
  const res = await fetch('/api/auth/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) {
    throw new Error(body.message || 'Не удалось отправить код');
  }
}

export const OtpModal: React.FC<Props> = ({
  open,
  phone,
  onClose,
  onVerified,
}) => {
  const { data: session, update: updateSession } = useSession();
  const [code, setCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(RESEND_COOLDOWN_SEC);
  const sentForPhoneRef = React.useRef<string | null>(null);

  // Send the first code as soon as the modal opens for a given phone.
  React.useEffect(() => {
    if (!open) {
      sentForPhoneRef.current = null;
      setCode('');
      setSecondsLeft(RESEND_COOLDOWN_SEC);
      return;
    }
    if (sentForPhoneRef.current === phone) return;
    sentForPhoneRef.current = phone;
    requestSendCode(phone)
      .then(() => {
        toast.success('Код отправлен в Telegram', { icon: '📩' });
        setSecondsLeft(RESEND_COOLDOWN_SEC);
      })
      .catch((err) => {
        toast.error(err.message || 'Не удалось отправить код', { icon: '❌' });
      });
  }, [open, phone]);

  // Countdown for the resend button.
  React.useEffect(() => {
    if (!open) return;
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [open, secondsLeft]);

  const handleResend = async () => {
    try {
      await requestSendCode(phone);
      toast.success('Новый код отправлен', { icon: '📩' });
      setSecondsLeft(RESEND_COOLDOWN_SEC);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось отправить код';
      toast.error(message, { icon: '❌' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 4) {
      toast.error('Введите код', { icon: '❌' });
      return;
    }

    setSubmitting(true);
    try {
      if (session?.user) {
        // Logged-in user attaching a phone to their existing account.
        const res = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        if (!res.ok) {
          throw new Error(body.message || 'Неверный код');
        }
        await updateSession();
      } else {
        // Guest checkout — create / log in via the phone-otp NextAuth provider.
        const resp = await signIn('phone-otp', {
          phone,
          code,
          redirect: false,
        });
        if (!resp?.ok) {
          throw new Error('Неверный код');
        }
      }

      toast.success('Телефон подтверждён', { icon: '✅' });
      onVerified();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неверный код';
      toast.error(message, { icon: '❌' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className='w-[400px] bg-white p-8'>
        <DialogTitle className='text-xl font-bold'>
          Подтвердите номер телефона
        </DialogTitle>
        <DialogDescription>
          Мы отправили 6-значный код в Telegram на номер{' '}
          <span className='font-medium'>{maskPhone(phone)}</span>. Введите его,
          чтобы оформить заказ.
        </DialogDescription>

        <form onSubmit={handleSubmit} className='flex flex-col gap-4 mt-2'>
          <Input
            inputMode='numeric'
            autoComplete='one-time-code'
            maxLength={6}
            placeholder='000000'
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            className='text-center text-2xl tracking-[0.5em] font-mono h-14'
            autoFocus
          />

          <Button
            type='submit'
            loading={submitting}
            className='h-12 text-base'
          >
            Подтвердить
          </Button>

          <button
            type='button'
            onClick={handleResend}
            disabled={secondsLeft > 0}
            className='text-sm text-gray-500 hover:text-primary disabled:cursor-not-allowed'
          >
            {secondsLeft > 0
              ? `Отправить ещё раз через ${secondsLeft} сек.`
              : 'Отправить код заново'}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

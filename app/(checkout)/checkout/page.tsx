'use client';

import { CheckoutSidebar, Container, Title } from '@/components/shared';
import {
  CheckoutAddressForm,
  CheckoutCart,
  CheckoutPersonalForm,
} from '@/components/shared/checkout';
import { OtpModal } from '@/components/shared/modals';
import { checkoutFormSchema, CheckoutFormValues } from '@/constants';
import { useCart } from '@/hooks';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import React from 'react';
import { createOrder } from '@/app/actions';
import toast from 'react-hot-toast';
import { useSession } from 'next-auth/react';
import { Api } from '@/services/api-client';
import { normalizeRuPhone } from '@/lib/phone';

export default function CheckoutPage() {
  const [submitting, setSubmitting] = React.useState(false);
  const [otpOpen, setOtpOpen] = React.useState(false);
  const [pendingPhone, setPendingPhone] = React.useState<string>('');
  // Tracks phones the user has already verified during this checkout flow.
  // Once a phone is in this set we skip the OTP step on subsequent submits.
  const verifiedPhonesRef = React.useRef<Set<string>>(new Set());

  const { totalAmount, updateItemQuantity, items, removeCartItem, loading } =
    useCart();
  const { data: session, update: updateSession } = useSession();

  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      address: '',
      comment: '',
    },
  });

  React.useEffect(() => {
    async function fetchUserInfo() {
      const data = await Api.auth.getMe();
      const [firstName, lastName] = (data.fullName || '').split(' ');

      if (firstName) form.setValue('firstName', firstName);
      if (lastName) form.setValue('lastName', lastName);
      if (data.email) form.setValue('email', data.email);
      if (data.phone) {
        form.setValue('phone', data.phone);
        if (data.phoneVerified) {
          verifiedPhonesRef.current.add(data.phone);
        }
      }
    }

    if (session) {
      fetchUserInfo();
    }
  }, [session]);

  const onClickCountButton = (
    id: number,
    quantity: number,
    type: 'plus' | 'minus'
  ) => {
    const newQuantity = type === 'plus' ? quantity + 1 : quantity - 1;
    updateItemQuantity(id, newQuantity);
  };

  const submitOrder = async (data: CheckoutFormValues) => {
    try {
      setSubmitting(true);
      const url = await createOrder(data);

      toast.success('Заказ оформлен, переходим к оплате', { icon: '✅' });

      if (url) {
        location.href = url;
      } else {
        setSubmitting(false);
      }
    } catch (err) {
      console.log(err);
      setSubmitting(false);
      toast.error('Не удалось создать заказ', { icon: '❌' });
    }
  };

  const onSubmit = async (data: CheckoutFormValues) => {
    const normalized = normalizeRuPhone(data.phone);
    if (!normalized) {
      toast.error('Введите корректный номер телефона', { icon: '❌' });
      return;
    }

    const alreadyVerified =
      verifiedPhonesRef.current.has(normalized) ||
      (session?.user.phoneVerified === true);

    if (alreadyVerified) {
      await submitOrder({ ...data, phone: normalized });
      return;
    }

    setPendingPhone(normalized);
    setOtpOpen(true);
  };

  const handleOtpVerified = async () => {
    setOtpOpen(false);
    verifiedPhonesRef.current.add(pendingPhone);
    await updateSession();

    const values = form.getValues();
    await submitOrder({ ...values, phone: pendingPhone });
  };

  return (
    <Container className='mt-10'>
      <Title
        text='Оформление заказа'
        className='font-extrabold mb-8 text-[36px]'
      />

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className='flex gap-10'>
            {/* Левая часть */}
            <div className='flex flex-col gap-10 flex-1 mb-20'>
              <CheckoutCart
                onClickCountButton={onClickCountButton}
                removeCartItem={removeCartItem}
                items={items}
                loading={loading}
              />

              <CheckoutPersonalForm
                className={loading ? 'opacity-40 pointer-events-none' : ''}
              />

              <CheckoutAddressForm
                className={loading ? 'opacity-40 pointer-events-none' : ''}
              />
            </div>

            {/* Правая часть */}
            <div className='w-[450px]'>
              <CheckoutSidebar
                totalAmount={totalAmount}
                loading={loading || submitting}
              />
            </div>
          </div>
        </form>
      </FormProvider>

      <OtpModal
        open={otpOpen}
        phone={pendingPhone}
        onClose={() => setOtpOpen(false)}
        onVerified={handleOtpVerified}
      />
    </Container>
  );
}

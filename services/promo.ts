import { axiosInstance } from './instance';

export type PromoKindValue = 'PERCENT' | 'FIXED' | 'FREE_DELIVERY';

export type ValidatedPromo = {
  code: string;
  kind: PromoKindValue;
  description: string | null;
  appliedAmount: number;
  freeDelivery: boolean;
  subtotal: number;
};

export const validate = async (code: string): Promise<ValidatedPromo> => {
  const { data } = await axiosInstance.post<ValidatedPromo>('/promo/validate', {
    code,
  });
  return data;
};

'use client';

import React from 'react';
import { AddressSuggestions } from 'react-dadata';
import 'react-dadata/dist/react-dadata.css';
import { Input } from '../ui';

interface Props {
  onChange?: (value?: string) => void;
  placeholder?: string;
}

export const AdressInput: React.FC<Props> = ({
  onChange,
  placeholder = 'Введите адрес',
}) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Input
        disabled
        placeholder={placeholder}
        className='h-12 text-base opacity-100'
      />
    );
  }

  return (
    <AddressSuggestions
      token='e79432bcfb5eeba8166a6245a2ab4bd6b31bc112'
      onChange={(data) => onChange?.(data?.value)}
      inputProps={{
        placeholder,
      }}
    />
  );
};

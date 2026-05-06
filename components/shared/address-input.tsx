'use client';

import React from 'react';
import { AddressSuggestions } from 'react-dadata';
import 'react-dadata/dist/react-dadata.css';
import { Input } from '../ui';

interface Props {
  value?: string;
  onChange?: (value?: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}

export const AdressInput: React.FC<Props> = ({
  value,
  onChange,
  onBlur,
  placeholder = 'Введите адрес',
}) => {
  const [mounted, setMounted] = React.useState(false);
  const token = process.env.NEXT_PUBLIC_DADATA_TOKEN;

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !token) {
    return (
      <Input
        disabled={!mounted}
        value={value ?? ''}
        onBlur={onBlur}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className='h-12 text-base opacity-100'
      />
    );
  }

  return (
    <AddressSuggestions
      token={token}
      onChange={(data) => onChange?.(data?.value)}
      inputProps={{
        onBlur,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
          onChange?.(event.target.value),
        placeholder,
      }}
    />
  );
};

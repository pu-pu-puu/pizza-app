import React from 'react';

interface Props {
  code: string;
  origin: string;
}

export const VerificationUserTemplate: React.FC<Props> = ({ code, origin }) => (
  <div>
    <p>
      Код подтверждения: <h2>{code}</h2>
    </p>

    <p>
      <a href={`${origin}/api/auth/verify?code=${code}`}>Подтвердить регистрацию</a>
    </p>
  </div>
);

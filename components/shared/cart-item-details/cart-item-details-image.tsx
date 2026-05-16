import { cn } from '@/lib/utils';
import NextImage from 'next/image';

interface Props {
  src: string;
  className?: string;
}

export const CartItemDetailsImage: React.FC<Props> = ({ src, className }) => {
  return (
    <NextImage
      src={src}
      alt=''
      width={60}
      height={60}
      className={cn('w-[60px] h-[60px]', className)}
    />
  );
};

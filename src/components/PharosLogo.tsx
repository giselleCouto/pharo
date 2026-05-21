import { cn } from '@/lib/utils';

const LOGO_FULL = '/pharos-logo.png';
const LOGO_ICON = '/favicon.png';

interface PharosLogoProps {
  /** Logo completa (ícone + texto) ou só o ícone */
  variant?: 'full' | 'icon';
  className?: string;
  iconClassName?: string;
  fullClassName?: string;
  alt?: string;
}

export function PharosLogo({
  variant = 'full',
  className,
  iconClassName,
  fullClassName,
  alt = 'Pharos',
}: PharosLogoProps) {
  if (variant === 'icon') {
    return (
      <img
        src={LOGO_ICON}
        alt={alt}
        className={cn('object-contain', iconClassName ?? className)}
      />
    );
  }

  return (
    <img
      src={LOGO_FULL}
      alt={alt}
      className={cn('object-contain object-left', fullClassName ?? className)}
    />
  );
}

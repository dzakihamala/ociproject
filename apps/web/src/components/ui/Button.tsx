import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'accent' | 'outline' | 'danger' | 'inline';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-primary border-primary text-white hover:bg-green-dark hover:border-green-dark hover:shadow-md hover:-translate-y-px',
  accent:
    'bg-accent border-accent text-white hover:bg-green-dark hover:border-green-dark hover:shadow-md hover:-translate-y-px',
  outline:
    'bg-transparent border-border-2 text-green-dark hover:bg-green-pale hover:border-primary hover:shadow-md',
  danger:
    'bg-error border-error text-white hover:opacity-85 hover:shadow-md',
  inline:
    'bg-primary border-primary text-white hover:bg-green-dark hover:border-green-dark w-auto whitespace-nowrap shrink-0',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base =
    'inline-block py-[9px] px-[18px] rounded-btn cursor-pointer font-sans font-medium text-[13px] transition-all duration-200 text-center border no-underline w-full disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none disabled:transform-none disabled:shadow-none active:translate-y-0 active:shadow-none';

  return (
    <button
      className={`${base} ${variantClass[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? '...' : children}
    </button>
  );
}

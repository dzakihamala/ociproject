import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  className?: string;
}

export function Badge({ children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 py-[3px] px-[10px] rounded-badge text-[11px] font-medium bg-green-pale border border-[rgba(107,143,94,0.2)] text-green-dark ${className}`}
    >
      {children}
    </span>
  );
}

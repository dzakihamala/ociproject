import type { ReactNode } from 'react';

interface EmptyStateProps {
  children: ReactNode;
  className?: string;
}

export function EmptyState({ children, className = '' }: EmptyStateProps) {
  return (
    <div className={`text-center py-8 text-text-3 text-[13px] ${className}`}>
      {children}
    </div>
  );
}

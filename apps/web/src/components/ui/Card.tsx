import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-card p-6 mb-4 overflow-hidden break-words shadow-sm transition-shadow duration-[0.25s] ease-out hover:shadow-md ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

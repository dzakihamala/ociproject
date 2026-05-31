import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

const labelClass = 'block mb-[5px] font-medium text-xs text-text tracking-wider';
const fieldClass =
  'w-full py-[10px] px-[13px] border border-border rounded-input bg-surface font-sans text-sm text-text transition-colors duration-200 outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(107,143,94,0.12)] placeholder:text-text-3';

export function Input({ label, className = '', id, ...props }: InputProps) {
  return (
    <div className="mb-[14px]">
      {label && <label htmlFor={id} className={labelClass}>{label}</label>}
      <input id={id} className={`${fieldClass} ${className}`} {...props} />
    </div>
  );
}

export function Textarea({ label, className = '', id, ...props }: TextareaProps) {
  return (
    <div className="mb-[14px]">
      {label && <label htmlFor={id} className={labelClass}>{label}</label>}
      <textarea id={id} className={`${fieldClass} ${className}`} {...props} />
    </div>
  );
}

export function Select({ label, className = '', id, children, ...props }: SelectProps) {
  return (
    <div className="mb-[14px]">
      {label && <label htmlFor={id} className={labelClass}>{label}</label>}
      <select id={id} className={`${fieldClass} cursor-pointer appearance-none ${className}`} {...props}>
        {children}
      </select>
    </div>
  );
}

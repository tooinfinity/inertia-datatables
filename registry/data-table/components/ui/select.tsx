import type { SelectHTMLAttributes, HTMLAttributes, OptionHTMLAttributes, ButtonHTMLAttributes } from 'react';

export const Select = ({ children, onValueChange, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { onValueChange?: (_value: string) => void }) => (
    <select {...props} onChange={(e) => onValueChange?.(e.target.value)}>{children}</select>
);

export const SelectContent = ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;

export const SelectItem = ({ children, ...props }: OptionHTMLAttributes<HTMLOptionElement>) => <option {...props}>{children}</option>;

export const SelectTrigger = ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>;

export const SelectValue = ({ children, placeholder, ...props }: HTMLAttributes<HTMLSpanElement> & { placeholder?: string }) => (
    <span {...props}>{children ?? placeholder}</span>
);
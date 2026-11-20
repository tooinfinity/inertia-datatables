import type { ButtonHTMLAttributes, HTMLAttributes, OptionHTMLAttributes, ReactNode } from 'react';

export const Select = ({
    children,
    value,
    onValueChange,
}: {
    children?: ReactNode;
    value?: string;
    onValueChange?: (_value: string) => void;
}) => (
    <select
        id="per-page"
        aria-label="Rows per page"
        value={value}
        onChange={(e) => onValueChange?.(e.target.value)}
    >
        {children}
    </select>
);

export const SelectContent = ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { side?: 'top' | 'bottom' | 'left' | 'right' }) => <div {...props}>{children}</div>;
export const SelectItem = ({ children, ...props }: OptionHTMLAttributes<HTMLOptionElement>) => <option {...props}>{children}</option>;
export const SelectTrigger = ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>;
export const SelectValue = ({ children, placeholder, ...props }: HTMLAttributes<HTMLSpanElement> & { placeholder?: string }) => <span {...props}>{children ?? placeholder}</span>;

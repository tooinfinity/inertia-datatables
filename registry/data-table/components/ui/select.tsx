import type { SelectHTMLAttributes, HTMLAttributes, OptionHTMLAttributes, ButtonHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  onValueChange?: (value: string) => void;
}
interface SelectContentProps extends HTMLAttributes<HTMLDivElement> {}
interface SelectItemProps extends OptionHTMLAttributes<HTMLOptionElement> {}
interface SelectTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {}
interface SelectValueProps extends HTMLAttributes<HTMLSpanElement> {
  placeholder?: string;
}

export const Select = ({ children, ...props }: SelectProps) => <select {...props}>{children}</select>;
export const SelectContent = ({ children, ...props }: SelectContentProps) => <div {...props}>{children}</div>;
export const SelectItem = ({ children, ...props }: SelectItemProps) => <option {...props}>{children}</option>;
export const SelectTrigger = ({ children, ...props }: SelectTriggerProps) => <button {...props}>{children}</button>;
export const SelectValue = ({ children, ...props }: SelectValueProps) => <span {...props}>{children}</span>;
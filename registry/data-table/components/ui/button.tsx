import type { ButtonHTMLAttributes } from 'react';

export const Button = ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'; size?: 'default' | 'sm' | 'lg' | 'icon'; asChild?: boolean }) => (
    <button {...props}>{children}</button>
);
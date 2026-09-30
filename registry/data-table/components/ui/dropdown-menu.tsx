import type { HTMLAttributes } from 'react';

interface DropdownMenuProps extends HTMLAttributes<HTMLDivElement> {}
interface DropdownMenuContentProps extends HTMLAttributes<HTMLDivElement> {
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
}
interface DropdownMenuItemProps extends HTMLAttributes<HTMLDivElement> {}
interface DropdownMenuTriggerProps extends HTMLAttributes<HTMLDivElement> {
  asChild?: boolean;
}

export const DropdownMenu = ({ children, ...props }: DropdownMenuProps) => <div {...props}>{children}</div>;
export const DropdownMenuContent = ({ children, ...props }: DropdownMenuContentProps) => <div {...props}>{children}</div>;
export const DropdownMenuItem = ({ children, ...props }: DropdownMenuItemProps) => <div {...props}>{children}</div>;
export const DropdownMenuTrigger = ({ children, ...props }: DropdownMenuTriggerProps) => <div {...props}>{children}</div>;
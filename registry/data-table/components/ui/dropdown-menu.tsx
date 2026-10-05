import type { HTMLAttributes } from 'react';

export const DropdownMenu = ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;

export const DropdownMenuContent = ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { sideOffset?: number; align?: 'start' | 'center' | 'end' }) => <div {...props}>{children}</div>;

export const DropdownMenuItem = ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;

export const DropdownMenuTrigger = ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) => <div {...props}>{children}</div>;

export const DropdownMenuSeparator = ({ ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props} />;

export const DropdownMenuLabel = ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;
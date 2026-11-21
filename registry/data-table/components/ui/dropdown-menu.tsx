import type { HTMLAttributes } from 'react';
export const DropdownMenu = ({ children, open, onOpenChange: _onOpenChange, ...props }: HTMLAttributes<HTMLDivElement> & { open?: boolean; onOpenChange?: (_open: boolean) => void }) => <div {...props} data-open={open}>{children}</div>;
export const DropdownMenuContent = ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { sideOffset?: number; align?: 'start' | 'center' | 'end' }) => <div {...props}>{children}</div>;
export const DropdownMenuItem = ({ children, onSelect: _onSelect, ...props }: { onSelect?: (event: Event) => void } & Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'>) => (
    <div {...props} onClick={(e) => { props.onClick?.(e); _onSelect?.(new Event('select', { bubbles: true, cancelable: false })); }}>{children}</div>
);
export const DropdownMenuTrigger = ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) => <div {...props}>{children}</div>;
export const DropdownMenuSeparator = ({ ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props} />;
export const DropdownMenuLabel = ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;

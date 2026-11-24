import * as React from 'react';
import type { HTMLAttributes } from 'react';

export const DropdownMenu = ({ children, open, onOpenChange: _onOpenChange, ...props }: HTMLAttributes<HTMLDivElement> & { open?: boolean; onOpenChange?: (_open: boolean) => void }) => <div {...props} data-open={open}>{children}</div>;
export const DropdownMenuContent = ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { sideOffset?: number; align?: 'start' | 'center' | 'end' }) => <div {...props}>{children}</div>;
export const DropdownMenuItem = ({ children, onSelect: _onSelect, ...props }: { onSelect?: (event: Event) => void } & Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'>) => (
    <div {...props} onClick={(e) => { props.onClick?.(e); _onSelect?.(new Event('select', { bubbles: true, cancelable: false })); }}>{children}</div>
);
export const DropdownMenuTrigger = ({ children, ...props }: HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) => <div {...props}>{children}</div>;
export const DropdownMenuSeparator = ({ ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props} />;
export const DropdownMenuLabel = ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>;

const DropdownMenuRadioGroupContext = React.createContext<{
    value: string | undefined;
    onValueChange: ((value: string) => void) | undefined;
}>({ value: undefined, onValueChange: undefined });

// Checkbox menu item: exposes `menuitemcheckbox` with `aria-checked` derived
// from the controlled `checked` prop. Clicking notifies the parent of the next
// state via `onCheckedChange`; the parent owns the selection state.
export const DropdownMenuCheckboxItem = ({
    children,
    checked = false,
    onCheckedChange,
    ...props
}: { checked?: boolean; onCheckedChange?: (checked: boolean) => void } & Omit<HTMLAttributes<HTMLDivElement>, 'onCheckedChange'>) => {
    const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
        props.onClick?.(event);
        onCheckedChange?.(!checked);
    };

    return (
        <div {...props} role="menuitemcheckbox" aria-checked={checked} onClick={onClick}>
            {children}
        </div>
    );
};

// Radio group: exposes `role="group"`. The selected value is controlled via
// the `value` prop; selecting an item notifies the parent through
// `onValueChange`.
export const DropdownMenuRadioGroup = ({
    children,
    value,
    onValueChange: externalOnValueChange,
    ...props
}: { value?: string; onValueChange?: (value: string) => void } & Omit<HTMLAttributes<HTMLDivElement>, 'onValueChange'>) => {
    const onValueChange = (next: string) => {
        externalOnValueChange?.(next);
    };

    return (
        <DropdownMenuRadioGroupContext.Provider value={{ value, onValueChange }}>
            <div {...props} role="group" aria-orientation="vertical">{children}</div>
        </DropdownMenuRadioGroupContext.Provider>
    );
};

export const DropdownMenuRadioItem = ({
    children,
    value,
    onCheckedChange,
    ...props
}: { value: string; onCheckedChange?: (checked: boolean) => void } & Omit<HTMLAttributes<HTMLDivElement>, 'onCheckedChange'>) => {
    const { value: groupValue, onValueChange } = React.useContext(DropdownMenuRadioGroupContext);
    const checked = groupValue === value;

    const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
        props.onClick?.(event);
        onCheckedChange?.(!checked);
        onValueChange?.(value);
    };

    return (
        <div {...props} role="menuitemradio" aria-checked={checked} onClick={onClick}>
            {children}
        </div>
    );
};

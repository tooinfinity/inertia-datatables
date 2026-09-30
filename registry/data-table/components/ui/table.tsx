import { forwardRef } from 'react';
import type { TableHTMLAttributes } from 'react';

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {}
interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {}
interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {}
interface TableFooterProps extends React.HTMLAttributes<HTMLTableSectionElement> {}
interface TableHeadProps extends React.HTMLAttributes<HTMLTableRowElement> {}
interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {}
interface TableCellProps extends React.HTMLAttributes<HTMLTableCellElement> {}
interface TableCaptionProps extends React.HTMLAttributes<HTMLTableCaptionElement> {}

export const Table = forwardRef<HTMLTableElement, TableProps>(({ children, ...props }, ref) => <table ref={ref} {...props}>{children}</table>);
export const TableHeader = ({ children, ...props }: TableHeaderProps) => <thead {...props}>{children}</thead>;
export const TableBody = ({ children, ...props }: TableBodyProps) => <tbody {...props}>{children}</tbody>;
export const TableFooter = ({ children, ...props }: TableFooterProps) => <tfoot {...props}>{children}</tfoot>;
export const TableHead = ({ children, ...props }: TableHeadProps) => <tr {...props}>{children}</tr>;
export const TableRow = ({ children, ...props }: TableRowProps) => <tr {...props}>{children}</tr>;
export const TableCell = ({ children, ...props }: TableCellProps) => <td {...props}>{children}</td>;
export const TableCaption = ({ children, ...props }: TableCaptionProps) => <caption {...props}>{children}</caption>;
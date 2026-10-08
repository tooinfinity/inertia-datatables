# Inertia Datatables

Server-side DataTables for Laravel + Inertia 3 with React 19, TanStack Table v8, and shadcn/ui.

## Installation

### Backend (Laravel)

```bash
composer require tooinfinity/inertia-datatables
```

Publish the configuration file:

```bash
php artisan vendor:publish --tag="inertia-datatables-config"
```

### Frontend (React + shadcn/ui)

Install the DataTable components via the shadcn registry:

```bash
npx shadcn@latest add https://raw.githubusercontent.com/tooinfinity/inertia-datatables/main/registry/data-table.json
```

This will install the complete DataTable feature into your application:

- `components/data-table/data-table.tsx`
- `components/data-table/data-table-toolbar.tsx`
- `components/data-table/data-table-pagination.tsx`
- `components/data-table/data-table-column-header.tsx`
- `components/data-table/data-table-column-visibility.tsx`
- `components/data-table/data-table-empty.tsx`
- `components/data-table/use-data-table.ts`
- `components/data-table/types.ts`

Required shadcn primitives (auto-installed as registry dependencies):
- `button`
- `input`
- `dropdown-menu`
- `select`
- `checkbox`
- `table`
- `skeleton`

Required npm dependency (auto-installed):
- `@tanstack/react-table`

## Configuration

The package uses `config/inertia-datatables.php`:

```php
return [
    'default_per_page' => 25,
    'max_per_page' => 100,
    'per_page_options' => [10, 25, 50, 100],
    'search' => [
        'debounce' => 300,
    ],
    'query' => [
        'page' => 'page',
        'per_page' => 'per_page',
        'search' => 'search',
        'searches' => 'searches',
        'sort' => 'sort',
        'filters' => 'filters',
    ],
];
```

## Backend Usage

### With Eloquent Builder

```php
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;

public function index()
{
    $users = DataTable::query(User::query())
        ->columns([
            Column::make('name')
                ->label('Name')
                ->searchable()
                ->sortable(),

            Column::make('email')
                ->label('Email')
                ->searchable()
                ->sortable(),

            Column::make('status')
                ->label('Status')
                ->filterable()
                ->sortable(),

            Column::make('created_at')
                ->label('Created')
                ->sortable(),
        ])
        ->defaultSort('created_at', 'desc')
        ->handle();

    return inertia('Users/Index', [
        'users' => $users,
    ]);
}
```

### With Query Builder

```php
use Illuminate\Support\Facades\DB;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;

public function index()
{
    $users = DataTable::query(DB::table('users'))
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
            Column::make('created_at')->sortable(),
        ])
        ->defaultSort('created_at', 'desc')
        ->handle();

    return inertia('Users/Index', [
        'users' => $users,
    ]);
}
```

### Column Options

```php
Column::make('name');                              // Basic column
Column::make('name')->label('Full Name');          // Custom label
Column::make('email')->searchable();               // Enable global search
Column::make('email')->sortable();                 // Enable sorting
Column::make('status')->filterable();              // Enable filtering (text input)
Column::make('status')->filterable()->filterType('select')->filterOptions([
    ['value' => 'active', 'label' => 'Active'],
    ['value' => 'inactive', 'label' => 'Inactive'],
]);                                                // Select dropdown filter
Column::make('is_admin')->filterable()->filterType('boolean'); // Yes/No filter
Column::make('internal_id')->hidden();             // Hide from UI (but available in data)
```

### Filter Types

| Type | Description | UI Control |
|------|-------------|------------|
| `text` (default) | Free-text exact match | Text input |
| `select` | Predefined options | Checkbox list |
| `boolean` | True/false values | Yes/No checkboxes |

### Request Parameters

The DataTable accepts these query parameters:

| Parameter | Description |
|-----------|-------------|
| `page` | Current page number |
| `per_page` | Items per page (max: `max_per_page` config) |
| `search` | Global search across searchable columns |
| `sort` | Sort columns (e.g., `name,-created_at`) |
| `filters` | Column filters (e.g., `filters[status]=active`) |
| `searches` | Column-specific search (e.g., `searches[name]=john`) |

## Frontend Usage

```tsx
import { DataTable } from '@/components/data-table/data-table';

type User = {
    id: number;
    name: string;
    email: string;
    status: string;
    created_at: string;
};

export default function Index({ users }: { users: DataTableResponse<User> }) {
    return (
        <DataTable data={users} dataPropName="users" />
    );
}
```

The `dataPropName` prop specifies which Inertia page prop contains the DataTable result. This enables correct partial reloads when the table data changes. If omitted, it defaults to `'data'`.

### TypeScript Types

The package exports these types from `components/data-table/types.ts`:

```typescript
interface DataTableColumn {
    name: string;
    label: string;
    sortable: boolean;
    searchable: boolean;
    filterable: boolean;
    hidden: boolean;
    filter_type?: 'text' | 'select' | 'boolean' | null;
    filter_options?: Array<{ value: string; label: string }>;
}

interface DataTableMeta {
    current_page: number;
    per_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
}

interface DataTableQuery {
    page: number;
    per_page: number;
    search: string;
    sort: Array<{ column: string; direction: string }>;
    searches: Array<{ column: string; value: string }>;
    filters: Array<{ column: string; value: unknown }>;
}

interface DataTableConfig {
    debounce: number;
    per_page_options: number[];
}

interface DataTableResponse<TData = unknown> {
    data: TData[];
    meta: DataTableMeta;
    query: DataTableQuery;
    columns: DataTableColumn[];
    config: DataTableConfig;
}
```

### Hook Options

The `useDataTable` hook accepts the following options:

```typescript
interface DataTableOptions<TData = unknown> {
    data: DataTableResponse<TData>;
    dataPropName?: string;  // Inertia prop name for partial reloads (default: 'data')
}
```

The `dataPropName` option specifies which Inertia page prop contains the DataTable result. This enables correct partial reloads when the table data changes.

## Security

The package implements a strict column allow-list. Only columns explicitly defined with `->searchable()`, `->sortable()`, or `->filterable()` can be used in requests. Malicious requests like `sort=users.password` or `filters[email]=admin@example.com` are rejected with clear exceptions.

## Query/Response Contract

### Request Parameters (Client → Server)

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `integer` | Current page number (min: 1) |
| `per_page` | `integer` | Items per page (min: 1, max: `max_per_page` config) |
| `search` | `string` | Global search across all searchable columns |
| `sort` | `string` | Comma-separated sort columns. Prefix with `-` for descending (e.g., `name,-created_at`) |
| `searches` | `object` | Column-specific search (e.g., `searches[name]=john&searches[email]=example`) |
| `filters` | `object` | Column filters (e.g., `filters[status]=active&filters[is_admin]=true`) |

#### Filter Value Semantics

| Value | Behavior |
|-------|----------|
| `"null"` / `"NULL"` | `WHERE column IS NULL` |
| `"not_null"` / `"NOT_NULL"` | `WHERE column IS NOT NULL` |
| `"*value"` | `LIKE '%value'` (wildcard prefix) |
| `"value*"` | `LIKE 'value%'` (wildcard suffix) |
| `"*value*"` | `LIKE '%value%'` (wildcard both sides) |
| `"true"` / `"false"` | Boolean exact match |
| Other strings | Exact match `WHERE column = value` |

### Response Structure (Server → Client)

```json
{
  "data": [],
  "meta": {
    "current_page": 1,
    "per_page": 25,
    "from": 1,
    "to": 25,
    "total": 100,
    "last_page": 4
  },
  "query": {
    "page": 1,
    "per_page": 25,
    "search": "",
    "sort": [],
    "searches": [],
    "filters": []
  },
  "columns": [
    {
      "name": "name",
      "label": "Name",
      "searchable": true,
      "sortable": true,
      "filterable": false,
      "hidden": false,
      "filter_type": null,
      "filter_options": []
    }
  ],
  "config": {
    "debounce": 300,
    "per_page_options": [10, 25, 50, 100]
  }
}
```

### TypeScript Types

```typescript
interface DataTableColumn {
    name: string;
    label: string;
    sortable: boolean;
    searchable: boolean;
    filterable: boolean;
    hidden: boolean;
    filter_type?: 'text' | 'select' | 'boolean' | null;
    filter_options?: Array<{ value: string; label: string }>;
}

interface DataTableMeta {
    current_page: number;
    per_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
}

interface DataTableQuery {
    page: number;
    per_page: number;
    search: string;
    sort: Array<{ column: string; direction: string }>;
    searches: Array<{ column: string; value: string }>;
    filters: Array<{ column: string; value: unknown }>;
}

interface DataTableConfig {
    debounce: number;
    per_page_options: number[];
}

interface DataTableResponse<TData = unknown> {
    data: TData[];
    meta: DataTableMeta;
    query: DataTableQuery;
    columns: DataTableColumn[];
    config: DataTableConfig;
}
```

## Optional: Reusable UsersDataTable Component

For projects with multiple user tables, extract a reusable component:

```tsx
// components/data-table/users-data-table.tsx
import { DataTable } from './data-table';

interface User {
    id: number;
    name: string;
    email: string;
    status: string;
    role: string;
    is_admin: boolean;
    created_at: string;
}

const columns = [
    { name: 'name', label: 'Name', searchable: true, sortable: true },
    { name: 'email', label: 'Email', searchable: true, sortable: true },
    { name: 'status', label: 'Status', filterable: true, sortable: true },
    { name: 'role', label: 'Role', filterable: true, sortable: true },
    { name: 'is_admin', label: 'Admin', filterable: true, filter_type: 'boolean', sortable: true },
    { name: 'created_at', label: 'Created', sortable: true },
] as const;

export function UsersDataTable({ users }: { users: DataTableResponse<User> }) {
    return <DataTable data={users} dataPropName="users" />;
}
```

```php
// In your controller
public function index()
{
    $users = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
            Column::make('role')->filterable()->sortable(),
            Column::make('is_admin')->filterable()->filterType('boolean')->sortable(),
            Column::make('created_at')->sortable(),
        ])
        ->defaultSort('created_at', 'desc')
        ->handle();

    return inertia('Users/Index', ['users' => $users]);
}
```

## Compatibility

| Laravel | PHP | Testbench | Status |
|---------|-----|-----------|--------|
| 12.x | 8.4+ | 10.x | ✅ Supported |
| 13.x | 8.4+ | 11.x | ✅ Supported |

## Testing

```bash
composer test
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information on what has changed recently.

## Contributing

Please review our [contributing guide](.github/CONTRIBUTING.md) to get started.

## Security Vulnerabilities

Please review [our security policy](.github/SECURITY.md) on how to report security vulnerabilities.

## Credits

- [TouwfiQ Meghlaoui](https://github.com/tooinfinity)
- [All Contributors](../../contributors)

## License

Inertia Datatables is open-sourced software licensed under the [MIT license](LICENSE.md).
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
Column::make('status')->filterable();              // Enable filtering
Column::make('internal_id')->hidden();             // Hide from UI (but available in data)
```

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
        <DataTable data={users} />
    );
}
```

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

## Security

The package implements a strict column allow-list. Only columns explicitly defined with `->searchable()`, `->sortable()`, or `->filterable()` can be used in requests. Malicious requests like `sort=users.password` or `filters[email]=admin@example.com` are rejected with clear exceptions.

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
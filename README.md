# Inertia Datatables

[![Tests](https://github.com/tooinfinity/inertia-datatables/actions/workflows/tests.yml/badge.svg)](https://github.com/tooinfinity/inertia-datatables/actions/workflows/tests.yml)
[![Latest Version on Packagist](https://img.shields.io/packagist/v/tooinfinity/inertia-datatables.svg?style=flat-square)](https://packagist.org/packages/tooinfinity/inertia-datatables)
[![Total Downloads](https://img.shields.io/packagist/dt/tooinfinity/inertia-datatables.svg?style=flat-square)](https://packagist.org/packages/tooinfinity/inertia-datatables)
[![License](https://img.shields.io/packagist/l/tooinfinity/inertia-datatables.svg?style=flat-square)](LICENSE.md)

Server-side DataTables for Laravel + Inertia 3 with React 19, TanStack Table v9, and shadcn/ui.

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
# For Laravel projects (installs to resources/js/components/)
npx shadcn@latest add https://raw.githubusercontent.com/tooinfinity/inertia-datatables/main/public/r/data-table.json

# Or from local path if cloning the repo
npx shadcn@latest add ./path/to/inertia-datatables/public/r/data-table.json
```

This will install the complete DataTable feature into your Laravel application:

- `resources/js/components/data-table/data-table.tsx`
- `resources/js/components/data-table/data-table-toolbar.tsx`
- `resources/js/components/data-table/data-table-pagination.tsx`
- `resources/js/components/data-table/data-table-column-header.tsx`
- `resources/js/components/data-table/data-table-column-visibility.tsx`
- `resources/js/components/data-table/data-table-empty.tsx`
- `resources/js/components/data-table/use-data-table.ts`
- `resources/js/components/data-table/types.ts`
- `resources/js/components/data-table/table-features.ts`
- `resources/js/components/data-table/cell-formatters.ts`
- `resources/js/components/ui/table.tsx`

Required shadcn primitives (auto-installed as registry dependencies):
- `button`
- `input`
- `dropdown-menu`
- `select`
- `checkbox`
- `table`
- `skeleton`

Required npm dependency (auto-installed):
- `@tanstack/react-table@^9.3.1` (TanStack Table v9)

## Configuration

The package uses `config/inertia-datatables.php`:

```php
return [
    'default_per_page' => 25,
    'max_per_page' => 100,
    'handle_exceptions' => true,
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
    'validation' => [
        'max_search_length' => 500,
        'max_filter_value_length' => 500,
        'max_sorts' => 10,
        'max_filters' => 20,
        'max_searches' => 20,
    ],
];
```

### Validation & Limits

The `validation` configuration protects your application against excessive payload sizes and Denial of Service (DoS) queries:

| Option | Default | Description |
|--------|---------|-------------|
| `max_search_length` | `500` | Maximum character length for global and column searches |
| `max_filter_value_length` | `500` | Maximum character length for individual filter values |
| `max_filter_values` | `20` | Maximum number of values in a multi-value filter array |
| `max_sorts` | `10` | Maximum number of sort columns permitted per request |
| `max_filters` | `20` | Maximum number of column filters permitted per request |
| `max_searches` | `20` | Maximum number of column-specific searches permitted per request |

### Exception Handling

Invalid client-supplied sort, filter, and search parameters are handled automatically; no application exception-handler wiring is required:

- JSON requests receive `422 Unprocessable Entity` with a `message` and an `errors.query` validation error bag.
- Inertia requests redirect back with the same validation error available under the `query` error key.
- These client errors are not reported to the application logger or error tracker by default.

Developer misconfiguration remains an exception. For example, an invalid `defaultSort()` column or direction still throws `InvalidSortException` and is handled by Laravel's normal exception reporting.

To opt out of the package's request handling, set `handle_exceptions` to `false` in `config/inertia-datatables.php`. Laravel will then use its default exception rendering and reporting behavior.

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
        ->responseKey('id')
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
        ->responseKey('id')
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

### Relation, Aliased and Computed Columns

A column name is both the response key and the database column. When they differ,
declare the database expression with `->field()`, read the value from a relationship
with `->relation()` or compute the value with `->value()`.

#### `->field()` — a different database expression

`->field()` keeps the response key separate from the database expression. The
expression is used to search, sort and filter the column and is selected for you,
so the value is exposed under the column name:

```php
$posts = DataTable::query(
    Post::query()->leftJoin('users', 'users.id', 'posts.user_id')
)
    ->columns([
        Column::make('title')->searchable()->sortable(),
        Column::make('author_name')->field('users.name')->searchable()->sortable(),
    ])
    ->handle();
```

The response row contains `author_name` with the joined value, while searching and
sorting happen on `users.name`. The join itself stays under your control, the
package never adds one for you.

#### `->relation()` — a value from a relationship

`->relation()` reads the column value from an Eloquent relationship. The
relationship is searched with `whereHas()`, sorted with a correlated subquery and
the related attribute is exposed under the column name:

```php
$posts = DataTable::query(Post::query())
    ->columns([
        Column::make('title')->searchable()->sortable(),
        Column::make('author_name')->relation('user', 'name')->searchable()->sortable()->filterable(),
    ])
    ->handle();
```

- The relationship is eager loaded for the current page
- `belongsTo` and `hasOne` relationships are supported
- The related attribute defaults to the related key when no column is given
- Relationship columns require an Eloquent query, they are not available for the
  query builder

#### `->value()` — a computed value

`->value()` computes the value of a column from the row:

```php
$posts = DataTable::query(Post::query())
    ->columns([
        Column::make('title')->sortable(),
        Column::make('summary')->value(fn (Post $post): string => $post->title.' ('.$post->status.')'),
    ])
    ->handle();
```

The computed value is added to the response under the column name. The computed
value is not part of the query, so searching and sorting a computed column needs
a custom callback.

#### Custom search, sort and filter callbacks

`->searchUsing()`, `->sortUsing()` and `->filterUsing()` take over the query
constraint of a column. The callback receives the query builder and the value it
should constrain:

```php
Column::make('title_length')
    ->searchable()
    ->searchUsing(fn (Builder $query, string $term, string $boolean): Builder => $query->where('title', 'like', $term.'%', $boolean))
    ->sortable()
    ->sortUsing(fn (Builder $query, string $direction): Builder => $query->orderByRaw('LENGTH(title) '.$direction))
    ->filterable()
    ->filterUsing(fn (Builder $query, mixed $value): Builder => $query->whereRaw('LENGTH(title) = ?', [(int) $value]))
    ->value(fn (Post $post): int => strlen($post->title));
```

- The search callback receives the search term and the boolean operator (`and` or
  `or`) that has to be applied to the constraint
- The sort callback receives the validated sort direction (`asc` or `desc`)
- The filter callback receives the filter value
- The callback works on the given query builder, so the constraint is added to the
  table query

Unknown columns are still rejected, no matter which options a column declares.

### Per-page Defaults

Use `->perPage(15)` to set the table's default page size:

```php
$users = DataTable::query(User::query())
    ->columns([
        Column::make('name')->sortable(),
    ])
    ->perPage(15)
    ->handle();
```

The default applies when the request does not include a `per_page` parameter. A client-supplied `per_page` takes precedence, allowing the user to choose another configured page size. Both values are clamped to `max_per_page`.

The effective page size is returned in both `query.per_page` and `meta.per_page`, so the frontend always reflects the number of rows actually loaded. The effective value is also included in `config.per_page_options`; options above `max_per_page` are excluded.

### Response Data Exposure

By default, each response row contains only the attributes declared in `columns()`. Undeclared attributes are removed from Eloquent and Query Builder results before the payload is returned, even when the underlying query uses `select *`.

Declare every attribute the frontend needs. To include a row key such as `id` without declaring it as a visible table column, use `->responseKey('id')`:

```php
$users = DataTable::query(User::query())
    ->columns([
        Column::make('name')->sortable(),
        Column::make('email')->sortable(),
    ])
    ->responseKey('id')
    ->handle();
```

Use `->exposeAll()` only when the response intentionally needs every selected attribute:

```php
$users = DataTable::query(User::query())
    ->columns([
        Column::make('name')->sortable(),
    ])
    ->exposeAll()
    ->handle();
```

> **Warning:** `->exposeAll()` restores the legacy behavior and can disclose undeclared attributes. Prefer declaring the required fields or configuring a single response key.

### Hidden Columns

The `->hidden()` option marks a column as hidden in the **UI only**. It does **not** restrict API access:

- Hidden columns are still included in the response data when they are declared
- Hidden columns can still be searched, sorted, and filtered if their capabilities are enabled
- The `hidden` flag is a UI hint for the frontend to not display the column by default
- For true security restrictions, do not declare sensitive columns in `columns()`

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
| `per_page` | Items per page (overrides the table's `->perPage()` default; max: `max_per_page` config) |
| `search` | Global search across searchable columns |
| `sort` | Sort columns (e.g., `name,-created_at`) |
| `filters` | Column filters (e.g., `filters[status]=active`) |
| `searches` | Column-specific search (e.g., `searches[name]=john`) |

## Frontend Usage

```tsx
import { DataTable } from '@/components/data-table/data-table';
import type { DataTableResponse } from '@/components/data-table/types';

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

> **Note:** The `@/` alias maps to `resources/js/` in Laravel projects. Components are installed to `resources/js/components/` via the shadcn registry. The registry components use the TanStack Table v9 `useTable` API with an explicit feature set.

The `dataPropName` prop specifies which Inertia page prop contains the DataTable result. This enables correct partial reloads when the table data changes. If omitted, it defaults to `'data'`.

### TypeScript Types

The package exports these types from `components/data-table/types.ts`:

```typescript
import type { RowData } from '@tanstack/react-table';

interface DataTableColumn<TData extends RowData = Record<string, unknown>> {
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

interface DataTableResponse<TData extends RowData = Record<string, unknown>> {
    data: TData[];
    meta: DataTableMeta;
    query: DataTableQuery;
    columns: DataTableColumn<TData>[];
    config: DataTableConfig;
}
```

### Hook Options

The `useDataTable` hook accepts the following options:

```typescript
interface DataTableOptions<TData extends RowData = Record<string, unknown>> {
    data: DataTableResponse<TData>;
    dataPropName?: string;  // Inertia prop name for partial reloads (default: 'data')
}
```

The `dataPropName` option specifies which Inertia page prop contains the DataTable result. This enables correct partial reloads when the table data changes.

## Security

The package implements strict allow-lists for both requests and response data:

- Only columns explicitly defined with `->searchable()`, `->sortable()`, or `->filterable()` can be used in requests. Malicious requests like `sort=users.password` or `filters[email]=admin@example.com` are rejected with clear validation errors instead of server errors.
- Response rows contain only declared columns by default. Undeclared database attributes are not serialized into the Inertia payload.
- `->responseKey('id')` explicitly permits one additional row attribute. `->exposeAll()` disables response projection and should only be used when all selected attributes are safe to disclose.
- Eloquent model `$hidden` and `$visible` attributes continue to apply. Query Builder results do not have model-level visibility rules, so declared columns must be reviewed carefully.

## Query/Response Contract

### Request Parameters (Client → Server)

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | `integer` | Current page number (min: 1) |
| `per_page` | `integer` | Items per page (min: 1, max: `max_per_page` config) |
| `search` | `string` | Global search across all searchable columns |
| `sort` | `string` | Comma-separated sort columns. Prefix with `-` for descending (e.g., `name,-created_at`) |
| `searches` | `object` | Column-specific search (e.g., `searches[name]=john&searches[email]=example`) |
| `filters` | `object` | Column filters (e.g., `filters[status]=active&filters[is_admin]=true` or `filters[status][]=active&filters[status][]=inactive` for multi-value) |

#### Filter Value Semantics

| Value | Behavior |
|-------|----------|
| `"null"` / `"NULL"` | `WHERE column IS NULL` |
| `"not_null"` / `"NOT_NULL"` | `WHERE column IS NOT NULL` |
| `"*value"` | `LIKE '%value'` (wildcard prefix) |
| `"value*"` | `LIKE 'value%'` (wildcard suffix) |
| `"*value*"` | `LIKE '%value%'` (wildcard both sides) |
| `"true"` / `"false"` / `"1"` / `"0"` | Boolean exact match (automatically detected for any filterable column) |
| Other strings | Exact match `WHERE column = value` |
| Array (e.g., `filters[status][]=a&filters[status][]=b`) | `WHERE column IN (a, b)` — multi-value filter, supported for all filterable columns; for `select` type, values are validated against `filter_options` |

> **Note:** Array filters are limited by `max_filter_values` config (default: 20). Nested arrays are rejected. String values within arrays are truncated to `max_filter_value_length`.
>
> **Note:** Boolean values (`"true"`, `"false"`, `"1"`, `"0"`) are automatically converted to boolean for any filterable column. Explicit `filterType('boolean')` is still supported for backward compatibility.

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

The `query` object reflects the effective table state. In particular, `query.per_page` always matches `meta.per_page`, and an applied `defaultSort()` is included in `query.sort` even when the client did not send a sort parameter.

Each item in `data` contains only the declared columns, plus an optional attribute configured with `->responseKey()`. The `->exposeAll()` escape hatch restores the previous behavior of returning every selected attribute.

## Optional: Reusable UsersDataTable Component

For projects with multiple user tables, extract a reusable component:

```tsx
// resources/js/components/data-table/users-data-table.tsx
import { DataTable } from './data-table';
import type { DataTableResponse } from './types';

interface User {
    id: number;
    name: string;
    email: string;
    status: string;
    role: string;
    is_admin: boolean;
    created_at: string;
}

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
        ->responseKey('id')
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

### Databases

| Database | Status |
|----------|--------|
| SQLite | ✅ Supported |
| MySQL 8 | ✅ Supported |
| PostgreSQL 16 | ✅ Supported |

The package generates portable SQL, so search, filtering and sorting behave identically on every driver. In particular, global and column searches are case-insensitive everywhere, including PostgreSQL, where `LIKE` alone would be case-sensitive.

## Testing

```bash
composer test
```

### Databases

The test suite runs against SQLite by default. Point it at another driver with the standard Laravel environment variables:

```bash
DB_CONNECTION=mysql \
DB_HOST=127.0.0.1 \
DB_PORT=3306 \
DB_DATABASE=inertia_datatables \
DB_USERNAME=root \
DB_PASSWORD=secret \
composer test:unit
```

Use `DB_CONNECTION=pgsql` for PostgreSQL. CI runs the suite against all three drivers, and `tests/Integration/DialectTest.php` pins the behaviour that differs between them.

### Registry artifacts

The root `registry.json` is the single source of truth for the shadcn registry. The JSON files under `public/r` are generated artifacts and must not be edited manually.

Rebuild them after changing the manifest or any distributed source file:

```bash
npm ci
npm run registry:validate
npm run registry:build
```

CI rebuilds the registry and fails if `public/r` differs from the committed output.

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information on what has changed recently.

## Contributing

Please review our [contributing guide](.github/CONTRIBUTING.md) to get started.

## Security Vulnerabilities

Please review [our security policy](.github/SECURITY.md) on how to report security vulnerabilities.

## Credits

- [TouwfiQ Meghlaoui](https://github.com/tooinfinity)
- [All Contributors](https://github.com/tooinfinity/inertia-datatables/graphs/contributors)

## License

Inertia Datatables is open-sourced software licensed under the [MIT license](LICENSE.md).
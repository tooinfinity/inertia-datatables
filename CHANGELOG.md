# Release Notes

## [Unreleased](https://github.com/tooinfinity/inertia-datatables/compare/v0.1.0...HEAD)

### Added

- Multi-value filter support: `filters[column][]=value1&filters[column][]=value2` now uses `WHERE IN` for all filterable columns
- `max_filter_values` validation config (default: 20) to limit array size in multi-value filters
- `select` filter type validates array values against `filter_options`
- Nested arrays and objects in filter values are rejected with `422` error
- String values in filter arrays are truncated to `max_filter_value_length`

### Fixed

- Render invalid client sort, filter, and search parameters as `422` validation errors instead of server errors
- Suppress default reporting for handled client input errors and add the `handle_exceptions` opt-out configuration
- Remove the obsolete `HandlesInertiaDataTablesExceptions` trait; exception handling now works without app-side wiring

## [v0.1.0](https://github.com/tooinfinity/inertia-datatables/compare/v0.0.1...v0.1.0) - 202x-xx-xx

Initial pre-release.

## [v0.0.1](https://github.com/tooinfinity/inertia-datatables/compare/...v0.0.1) - 2026-10-08

Initial pre-release of inertia-datatables.

Server-side DataTables for Laravel + Inertia 3 with React 19, TanStack Table v8, and shadcn/ui.

**Features**

- Eloquent & Query Builder support
- Global search, column search, sorting, filtering
- Filter types: text, select, boolean
- Strict column allow-list security
- Configurable query parameter names
- Partial reloads via Inertia

**Frontend**

- shadcn registry component (DataTable, Toolbar, Pagination, ColumnHeader, ColumnVisibility, Empty)
- useDataTable hook with debounced search
- TypeScript types included

**Compatibility**

- Laravel 12.x / 13.x
- PHP 8.4+
- Testbench 10.x / 11.x

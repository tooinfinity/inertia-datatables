# Release Notes

## [Unreleased](https://github.com/tooinfinity/inertia-datatables/compare/v0.1.0...HEAD)

### Breaking Changes

- Response `data` now contains only declared columns by default. Add every client-required field to `columns()`, use `->responseKey('id')` to include one additional row key, or use `->exposeAll()` to restore the previous unrestricted response behavior (fixes #29)

### Added

- `->field()` for columns whose database expression differs from the response key, e.g. joined or aliased columns
- `->relation()` for columns that read their value from a `belongsTo` or `hasOne` relationship, searched with `whereHas()` and sorted with a correlated subquery
- `->value()` for columns whose value is computed from the row
- `->searchUsing()`, `->sortUsing()` and `->filterUsing()` for custom search, sort and filter constraints (fixes #31)
- `->responseKey('id')` for including one additional attribute in response data without exposing every undeclared attribute
- `->exposeAll()` escape hatch for restoring the previous unrestricted response data behavior
- Multi-value filter support: `filters[column][]=value1&filters[column][]=value2` now uses `WHERE IN` for all filterable columns
- `max_filter_values` validation config (default: 20) to limit array size in multi-value filters
- `select` filter type validates array values against `filter_options`
- Nested arrays and objects in filter values are rejected with `422` error
- String values in filter arrays are truncated to `max_filter_value_length`
- The test suite now runs against MySQL 8 and PostgreSQL 16 in CI, in addition to SQLite, and the database connection is driven by the standard `DB_*` environment variables (fixes #27)

### Changed

- The `Column` value object now copies its properties through a single `with()` helper instead of re-instantiating itself with every argument in each fluent method
- Upgraded the frontend registry to TanStack Table v9 with explicit table features and v9-compatible types
- Standardized package and registry metadata on TanStack Table v9

### Fixed

- Pagination now appends a unique tiebreaker to Eloquent and Query Builder ordering, preventing tied rows from appearing on multiple pages or disappearing between pages. Distinct, grouped and union queries are ordered by their projected row key, grouping columns or key alias whenever the query shape allows it (fixes #30)
- Render invalid client sort, filter, and search parameters as `422` validation errors instead of server errors
- Suppress default reporting for handled client input errors and add the `handle_exceptions` opt-out configuration
- Remove the obsolete `HandlesInertiaDataTablesExceptions` trait; exception handling now works without app-side wiring
- Boolean filter values (`"true"`, `"false"`, `"1"`, `"0"`) are now automatically detected and converted for any filterable column, not just those with `filterType('boolean')` (fixes #22)
- Generate shadcn registry artifacts from the canonical root manifest and reject stale output in CI (fixes #24)
- Composer dist archives now exclude the frontend registry, raw GitHub artifacts, lockfiles, and TypeScript tooling, reducing the downloaded package size by roughly 80% (fixes #26)
- Global and column searches are now case-insensitive on PostgreSQL, matching the existing behaviour on SQLite and MySQL (fixes #27)

## [v0.1.0](https://github.com/tooinfinity/inertia-datatables/compare/v0.0.1...v0.1.0) - 202x-xx-xx

Initial pre-release.

## [v0.0.1](https://github.com/tooinfinity/inertia-datatables/compare/...v0.0.1) - 2026-10-08

Initial pre-release of inertia-datatables.

Server-side DataTables for Laravel + Inertia 3 with React 19, TanStack Table v9, and shadcn/ui.

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

# Release Notes

## [Unreleased](https://github.com/tooinfinity/inertia-datatables/compare/v0.1.0...HEAD)

### Breaking Changes

- Response `data` now contains only declared columns by default. Add every client-required field to `columns()`, use `->responseKey('id')` to include one additional row key, or use `->exposeAll()` to restore the previous unrestricted response behavior (fixes #29)

### Added

- Benchmarks: CodSpeed performance tracking for the `DataTable` React component (Vitest, `npm run bench`) and server-side DataTable request handling (`composer bench`, `codspeed.yaml`), run on every pull request by `.github/workflows/codspeed.yml`

- Frontend installation UX: native shadcn GitHub registry support (`npx shadcn@latest add tooinfinity/inertia-datatables/data-table`) is now the primary recommended installation method in README, with direct URL and local registry file installation preserved as alternatives (fixes #137)
- Frontend installation verification: implemented a two-layer verification strategy with deterministic registry structure validation (`npm run registry:verify-consumer`) and a real consumer integration test using the native shadcn CLI (`npm run registry:test-consumer`) in CI (`.github/workflows/registry.yml`), ensuring Node.js `>=20.18.1` entrypoint compatibility, decoupled from private shadcn APIs, and verifying consumer alias file placement, npm dependency declaration, and consumer primitive preservation (fixes #137)

- React layer: custom cell renderers through the `cells` prop, keyed by column name (fixes #33)
- React layer: row actions through the `actions` prop, rendered as a trailing client side column (fixes #33)
- React layer: column definition overrides through the `columns` prop, merged with the server provided column meta (fixes #33)
- React layer: `toolbar` and `empty` slots, `rowKey`, and `onRowClick` props (fixes #33)
- React layer: the `useDataTable` hook returns `isLoading` and `error` (fixes #34)
- React layer: `visitOptions` prop to forward options to the Inertia `router.visit` call (fixes #34)
- React layer: search, filter, and sort visits replace the current history entry by default, so typing does not pollute the browser history (fixes #34)
- React layer: the table renders `aria-busy` and skeleton rows while a visit is in flight, and the `onError` prop handles failed visits (fixes #34)
- React layer: `visitOptions.onHttpException` and `visitOptions.onNetworkError` handle failed requests without the Inertia error modal (fixes #34)
- React layer: a development warning is logged when the `dataPropName` does not match any prop of the current Inertia page (fixes #34)
- The registry now ships a barrel file, so components and types can be imported from `@components/data-table`
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
- `->filterEnum()` for deriving select filter options from a PHP `BackedEnum`, with sensible default labels, custom labels via a map or resolver, and validation of submitted values against the enum's backed values (fixes #78)
- The test suite now runs against MySQL 8 and PostgreSQL 16 in CI, in addition to SQLite, and the database connection is driven by the standard `DB_*` environment variables (fixes #27)
- CI: enforce shadcn/ui component ownership boundaries — CODEOWNERS rules for the protected compatibility shims, generated registry artifacts, registry manifest, and ownership documentation, plus a `shadcn ownership` workflow that flags protected compatibility shim changes in pull requests and validates CODEOWNERS coverage (part of #136).
- CI: add shadcn/ui compatibility audit — automated audit that checks the seven package-maintained compatibility shims (button, checkbox, dropdown-menu, input, select, table, skeleton) against pinned official shadcn/ui upstream sources, reports structural differences requiring review, classifies role-equivalent shims as requiring manual review, distinguishes network failures from compatibility findings, and validates the compatibility manifest. Runs via the `shadcn compatibility audit` workflow with a deterministic validation job on every PR and a drift-detection job on schedule/manual dispatch (part of #136).

### Docs

- Clarify that the shadcn/ui compatibility audit drift mode reports only rendered HTML elements removed by the latest upstream (elements the baseline no longer renders); elements upstream adds are not reported, consistent with the validation subset rule.

### Changed

- Polished the DataTable registry UI/UX following shadcn/ui data-table patterns: cohesive toolbar layout with filter reset, in-toolbar column visibility, accessible dropdown-driven column filtering, integrated pagination with zero-result boundary handling and row selection feedback, and contained horizontal scrolling (fixes #79)
- The `Column` value object now copies its properties through a single `with()` helper instead of re-instantiating itself with every argument in each fluent method
- Upgraded the frontend registry to TanStack Table v9 with explicit table features and v9-compatible types
- Standardized package and registry metadata on TanStack Table v9

### Fixed

- shadcn/ui compatibility audit: strengthened manifest and source validation by strictly validating `rawUrlTemplate` repository host and path segments against `upstream.repository` (requiring exactly two non-empty segments `owner/repo`), validating local component file existence and parsing for all components including manual review entries, rejecting `{commit}` placed in URL fragments, enforcing exact comparison strategy mapping (`table` as `structural` and other 6 shims as `manual`), safely guarding upstream source validation when `manifest.upstream` is missing or invalid, making table semantic element enforcement mandatory at code level, and using `pathToFileURL` to reliably detect the CLI entry-point when repository path contains spaces.
- shadcn/ui compatibility audit: the component map is now built from actual export declarations (inline exports, grouped exports, and aliases) instead of every function declaration, so private helpers are excluded and components exported together at the end of a file are no longer missed; function parameter lists are now located with a delimiter-aware parenthesis scanner. Also removed a dangling manifest `$schema` reference to a schema file that does not exist.
- shadcn/ui compatibility audit: a TSX source with syntax errors is now rejected upfront and reported as a distinct parse failure (with diagnostics) instead of being conflated with a valid file that has no supported component exports, so CI audit output clearly distinguishes unparseable files from files with no exports.
- shadcn/ui compatibility audit: the pinned baseline is now validated against the required component exports before it is stored for drift comparison, and the same validation runs in `auditComponentDrift` so direct callers reject incomplete baselines before fetching latest. Only complete baselines are compared; when latest is missing a required export such as `TableCaption`, drift is reported.
- shadcn/ui compatibility audit: validation mode now fetches each component from the URL derived from the manifest's pinned baseline (`rawUrlTemplate` + `baselineCommit`) instead of the per-component `upstreamSource`, and manifest validation rejects `upstreamSource` URLs that do not match that baseline-derived URL; drift commit discovery builds the GitHub API URL from the manifest's `repository` and `branch` instead of hard-coded values, so validation and drift detection can no longer silently compare against different upstream revisions.
- shadcn/ui compatibility audit: manifest validation now requires `rawUrlTemplate` to identify the same repository as `upstream.repository` and to substitute the commit with `{commit}`, requires `table` to use the `structural` comparison strategy, and rejects the audit entry point on Node versions below 22.18.0 by replacing `import.meta.main` with a direct-entry check.
- shadcn/ui compatibility audit: the JSX collector no longer counts elements inside uncalled nested helper functions, so a component that returns `null` but nests a helper rendering a tag is no longer treated as rendering that tag; validation now also fails when a local `table` export does not render its required semantic element (e.g. `TableCaption` with no `<caption>`), which the subset rule previously accepted.
- shadcn/ui compatibility audit docs: clarify that the protected-path CI check rejects all changes to `registry/data-table/components/ui/` with no bypass or exception mechanism, so the maintenance-PR procedure cannot complete for a protected file until a repository administrator adds an exception or scopes the check.
- Pagination now appends a unique tiebreaker to Eloquent and Query Builder ordering, preventing tied rows from appearing on multiple pages or disappearing between pages. Distinct, grouped and union queries are ordered by their projected row key, grouping columns or key alias whenever the query shape allows it, and queries without a usable row key keep their original order (fixes #30)
- Render invalid client sort, filter, and search parameters as `422` validation errors instead of server errors
- Suppress default reporting for handled client input errors and add the `handle_exceptions` opt-out configuration
- Remove the obsolete `HandlesInertiaDataTablesExceptions` trait; exception handling now works without app-side wiring
- Boolean filter values (`"true"`, `"false"`, `"1"`, `"0"`) are converted only for columns that explicitly opt in with `filterType('boolean')`, preserving exact matches for literal `"0"` and `"1"` strings on standard columns (fixes #73, refs #22)
- Generate shadcn registry artifacts from the canonical root manifest and reject stale output in CI (fixes #24)
- Composer dist archives now exclude the frontend registry, raw GitHub artifacts, lockfiles, and TypeScript tooling, reducing the downloaded package size by roughly 80% (fixes #26)
- Global and column searches are now case-insensitive on PostgreSQL, matching the existing behaviour on SQLite and MySQL (fixes #27)
- Extremely large `page` values can no longer cause an integer overflow that returns first-page rows; huge pages are clamped to a safe bound based on the effective page size and return an empty result set instead (fixes #105)
- Row selection no longer collides across server-side pages or dataset updates when `rowKey` is omitted: row ids are derived from the row's `id` field (namespaced with `id:`) or, when no stable id exists, a generation-scoped fallback (`fallback:<generation>:<page>:<index>`) that changes when the dataset is replaced. Selection persists across pages and updates for stable ids; rows without a stable id or `rowKey` are effectively page- and dataset-scoped (fixes #102)
- React layer: automatically recover from an out-of-range pagination page (`current_page > last_page`) by navigating to the last available page with a replace-only visit, and clamp the pagination summary so it never reports an invalid `from > to` range (fixes #106)
- React layer: column headers now support three-state sorting (unsorted → ascending → descending → unsorted) so sorting can be cleared, Shift-click multi-column sorting to add secondary sort columns without replacing the current selection, and accessible labels that state the column, current sort state, priority, and the next sorting action; `aria-sort` is applied to the primary sorted column only (fixes #97)
- React layer: prevented duplicate dropdown state updates when interacting with DataTable filter chips, so a single click opens or closes a chip dropdown exactly once (fixes #98)
- React layer: pagination controls are exposed as a navigation landmark (`aria-label="Pagination"`) and the result summary is a polite live region (`role="status"`, `aria-live="polite"`) so screen-reader users can navigate pagination and hear result ranges from accepted responses and immediate row selection changes (fixes #107)
- React layer: filter chip dropdown options now use accessible Radix menu selection primitives — select and multi-select options render as `menuitemcheckbox` with `aria-checked`, and boolean Yes/No options render as a mutually exclusive `menuitemradio` group — instead of a `DropdownMenuItem` containing a nested `Checkbox` (fixes #108)

### Documentation

- Establish shadcn/ui component ownership boundaries and agent-protection rules for `registry/data-table/components/ui/`, `registry/data-table/components/data-table/`, and generated `public/r/` artifacts; add `docs/architecture/shadcn-component-ownership.md`.

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

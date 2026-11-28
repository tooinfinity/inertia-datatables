# Release Notes

## [0.1.0](https://github.com/tooinfinity/inertia-datatables/compare/v0.0.1...v0.1.0) (2026-11-28)


### Features

* add exception handler trait for 400 responses ([ea5129d](https://github.com/tooinfinity/inertia-datatables/commit/ea5129d2fab3466ed417b8c45a9c0c94211c35be))
* add input validation and DoS protection limits ([d537831](https://github.com/tooinfinity/inertia-datatables/commit/d53783148785316ec29e5015464246a19faed0a6))
* add multi-value filter support (fixes [#15](https://github.com/tooinfinity/inertia-datatables/issues/15)) ([#44](https://github.com/tooinfinity/inertia-datatables/issues/44)) ([a282275](https://github.com/tooinfinity/inertia-datatables/commit/a2822755f01676c82bf2557352886b1a6efdfd93))
* **ci:** add starter-kit integration coverage ([#57](https://github.com/tooinfinity/inertia-datatables/issues/57)) ([#69](https://github.com/tooinfinity/inertia-datatables/issues/69)) ([32f16de](https://github.com/tooinfinity/inertia-datatables/commit/32f16de791ae956721222fe56c26e46177d966f6))
* **column:** add BackedEnum support for select filter options (fixes [#78](https://github.com/tooinfinity/inertia-datatables/issues/78)) ([#84](https://github.com/tooinfinity/inertia-datatables/issues/84)) ([0e6a31a](https://github.com/tooinfinity/inertia-datatables/commit/0e6a31a3e21872a7c7df50616805a3099dbebd1c))
* **columns:** support relation and computed columns ([#60](https://github.com/tooinfinity/inertia-datatables/issues/60)) ([af9b9e9](https://github.com/tooinfinity/inertia-datatables/commit/af9b9e9ccc970abe3ab54f140d105d4fd3baac48))
* **frontend:** add cell renderers, row actions and visit state ([#62](https://github.com/tooinfinity/inertia-datatables/issues/62)) ([382da47](https://github.com/tooinfinity/inertia-datatables/commit/382da47ee84a50a6071a1cc4ee6964f8e5c75aac))
* **frontend:** upgrade to TanStack Table v9 ([#51](https://github.com/tooinfinity/inertia-datatables/issues/51)) ([7d4d9cc](https://github.com/tooinfinity/inertia-datatables/commit/7d4d9cc33a504fb6460f7b2617c98c41c9a3f391))
* **registry:** add narrow-viewport regression coverage for DataTable ([#74](https://github.com/tooinfinity/inertia-datatables/issues/74)) ([#87](https://github.com/tooinfinity/inertia-datatables/issues/87)) ([62243cf](https://github.com/tooinfinity/inertia-datatables/commit/62243cff642a7415f824fb3f7f0d9a40d0b24cfc))
* **registry:** polish DataTable registry UI/UX using shadcn patterns ([#79](https://github.com/tooinfinity/inertia-datatables/issues/79)) ([#81](https://github.com/tooinfinity/inertia-datatables/issues/81)) ([0147a9f](https://github.com/tooinfinity/inertia-datatables/commit/0147a9fc5db9765d085df76319797bcdefdc763b))
* **registry:** support explicit endpoint URL for DataTable visits ([#82](https://github.com/tooinfinity/inertia-datatables/issues/82)) ([5375c28](https://github.com/tooinfinity/inertia-datatables/commit/5375c28d48f288146054f5c40beca18db841feb4))
* simplify frontend installation with native shadcn registry ([#145](https://github.com/tooinfinity/inertia-datatables/issues/145)) ([d631967](https://github.com/tooinfinity/inertia-datatables/commit/d6319675131022b89d278b2873adf4e223194503))
* **ui:** move filters from column headers to toolbar beside search field ([#94](https://github.com/tooinfinity/inertia-datatables/issues/94)) ([622177d](https://github.com/tooinfinity/inertia-datatables/commit/622177d76ae231ec534064ac948dc0c1b9da996f))
* validate default sort at construction time ([ed0fe03](https://github.com/tooinfinity/inertia-datatables/commit/ed0fe03efb8e2a39f4f2f308be65a06b350dc34f))


### Bug Fixes

* allow interface types in DataTableResponse (fixes [#21](https://github.com/tooinfinity/inertia-datatables/issues/21)) ([#46](https://github.com/tooinfinity/inertia-datatables/issues/46)) ([d10961f](https://github.com/tooinfinity/inertia-datatables/commit/d10961f0388adc5757a7744898e15b5dfc13986a))
* auto-detect boolean filter values for any filterable column ([#48](https://github.com/tooinfinity/inertia-datatables/issues/48)) ([7945781](https://github.com/tooinfinity/inertia-datatables/commit/79457818cdb0e8b1a1f54ba7102e71cee0b2c471))
* **ci:** export-ignore .opencode in git archive ([adb8aeb](https://github.com/tooinfinity/inertia-datatables/commit/adb8aeb08ad8f6cacc83407a896bb9c58bdc2eac))
* **ci:** restore passing checks ([#41](https://github.com/tooinfinity/inertia-datatables/issues/41)) ([6f4ed5e](https://github.com/tooinfinity/inertia-datatables/commit/6f4ed5e2ca7c56e9549026916d2d39afd24b3214))
* **ci:** restore tests workflow execution ([#83](https://github.com/tooinfinity/inertia-datatables/issues/83)) ([4092ae6](https://github.com/tooinfinity/inertia-datatables/commit/4092ae60a12b52fe9744ab9eab601d0dc2884811))
* **core:** backend serialization, value objects and SQL hardening ([#2](https://github.com/tooinfinity/inertia-datatables/issues/2)) ([3f591bd](https://github.com/tooinfinity/inertia-datatables/commit/3f591bdcf19706833cfb6da4a5ded2667545d106))
* default cell renderer handles booleans, null, objects, arrays ([4b3d9d2](https://github.com/tooinfinity/inertia-datatables/commit/4b3d9d2c9e5e23270bde8511b0b77bd01de25ef3)), closes [#18](https://github.com/tooinfinity/inertia-datatables/issues/18)
* **filter:** make boolean coercion opt-in via filterType('boolean') ([#88](https://github.com/tooinfinity/inertia-datatables/issues/88)) ([d8a88bc](https://github.com/tooinfinity/inertia-datatables/commit/d8a88bc353e61e8f509963be2bb83e7db47a8468))
* **frontend:** headless hook and component runtime bug fixes ([#3](https://github.com/tooinfinity/inertia-datatables/issues/3)) ([1ad3fdf](https://github.com/tooinfinity/inertia-datatables/commit/1ad3fdf22a017eb1d24cc4e0b740afc8ed923e24))
* **frontend:** prevent duplicate filter chip dropdown state updates ([#98](https://github.com/tooinfinity/inertia-datatables/issues/98)) ([#133](https://github.com/tooinfinity/inertia-datatables/issues/133)) ([420505b](https://github.com/tooinfinity/inertia-datatables/commit/420505bb4461ee86ed830d87a2a0d25a3e9a7f68))
* **frontend:** React Compiler sort indicator and multi-value filters ([#52](https://github.com/tooinfinity/inertia-datatables/issues/52), [#54](https://github.com/tooinfinity/inertia-datatables/issues/54)) ([#67](https://github.com/tooinfinity/inertia-datatables/issues/67)) ([0fb9dc9](https://github.com/tooinfinity/inertia-datatables/commit/0fb9dc918747ecc843746107fcda0fb3bf4129e4))
* ignore array-valued query parameters ([#40](https://github.com/tooinfinity/inertia-datatables/issues/40)) ([e39d6d5](https://github.com/tooinfinity/inertia-datatables/commit/e39d6d5e3543645998992aec9675d44d0442ce45))
* **packaging:** exclude development tooling from Composer archives (fixes [#26](https://github.com/tooinfinity/inertia-datatables/issues/26)) ([#49](https://github.com/tooinfinity/inertia-datatables/issues/49)) ([bba0c2e](https://github.com/tooinfinity/inertia-datatables/commit/bba0c2e202e1e5b6b793d4af8836c4c96eb8f00a))
* **pagination:** ensure stable row ordering ([#61](https://github.com/tooinfinity/inertia-datatables/issues/61)) ([f088bcb](https://github.com/tooinfinity/inertia-datatables/commit/f088bcb950867c9476765841cda2c6d8d0e56c41))
* **pagination:** verify the row key before ordering ([#63](https://github.com/tooinfinity/inertia-datatables/issues/63)) ([2887de2](https://github.com/tooinfinity/inertia-datatables/commit/2887de2bf5037d0ac391413644e52aaf64193036))
* prevent pagination integer overflow on huge page values ([#128](https://github.com/tooinfinity/inertia-datatables/issues/128)) ([096863c](https://github.com/tooinfinity/inertia-datatables/commit/096863ca90a72442d76f4155914cc5ee2561e9c8))
* prevent search input losing keystrokes when earlier response arrives during typing (fixes [#17](https://github.com/tooinfinity/inertia-datatables/issues/17)) ([#45](https://github.com/tooinfinity/inertia-datatables/issues/45)) ([82c3aaa](https://github.com/tooinfinity/inertia-datatables/commit/82c3aaa46dcc6545d461153c5fd4cc3df1185601))
* **query:** reflect effective table state ([#47](https://github.com/tooinfinity/inertia-datatables/issues/47)) ([db57808](https://github.com/tooinfinity/inertia-datatables/commit/db57808ae99da815dcfc4da06dc5a74d288556a6))
* **react:** prevent row selection ID collisions across server-side pages ([#129](https://github.com/tooinfinity/inertia-datatables/issues/129)) ([15ffe44](https://github.com/tooinfinity/inertia-datatables/commit/15ffe4477c96a4805486eebeac25bb7b7571ae20))
* recover from out-of-range pagination pages ([#130](https://github.com/tooinfinity/inertia-datatables/issues/130)) ([123ce93](https://github.com/tooinfinity/inertia-datatables/commit/123ce93d934ca569d68dbcb2fe05222718b0c296))
* **registry:** add tests for zero-results summary and visible-column empty span ([#86](https://github.com/tooinfinity/inertia-datatables/issues/86)) ([3106fc4](https://github.com/tooinfinity/inertia-datatables/commit/3106fc4fcfdb40f41d0872eda27a5c564c57a3a5))
* **registry:** improve DataTable column header accessibility (fixes [#36](https://github.com/tooinfinity/inertia-datatables/issues/36)) ([#89](https://github.com/tooinfinity/inertia-datatables/issues/89)) ([607b8d9](https://github.com/tooinfinity/inertia-datatables/commit/607b8d967f85006bdbc6a6ded79557afcfbe72ee))
* **registry:** make artifacts reproducible ([#50](https://github.com/tooinfinity/inertia-datatables/issues/50)) ([6177b18](https://github.com/tooinfinity/inertia-datatables/commit/6177b18a16f27e2af4133ff756216163b9661649))
* **registry:** type DropdownMenuItem onSelect as native Event ([#53](https://github.com/tooinfinity/inertia-datatables/issues/53)) ([#66](https://github.com/tooinfinity/inertia-datatables/issues/66)) ([9abaec9](https://github.com/tooinfinity/inertia-datatables/commit/9abaec9b57a7f19dd98e0c3b0dd38567a461398d))
* return 422 for invalid table input ([#42](https://github.com/tooinfinity/inertia-datatables/issues/42)) ([157ce48](https://github.com/tooinfinity/inertia-datatables/commit/157ce48aeb9d4f06fa1d1212af6ad7deb2070cfb))
* **search:** escape LIKE patterns portably ([#43](https://github.com/tooinfinity/inertia-datatables/issues/43)) ([da0fbae](https://github.com/tooinfinity/inertia-datatables/commit/da0fbae27157e5d2d53ec1de40e188fca0658893)), closes [#13](https://github.com/tooinfinity/inertia-datatables/issues/13)
* **search:** ignore numeric query keys ([#39](https://github.com/tooinfinity/inertia-datatables/issues/39)) ([7c2552a](https://github.com/tooinfinity/inertia-datatables/commit/7c2552a425c40e9414470287dc21b10e4fda64fd))
* **security:** restrict response data to declared columns ([#58](https://github.com/tooinfinity/inertia-datatables/issues/58)) ([b658ac2](https://github.com/tooinfinity/inertia-datatables/commit/b658ac28fc67032aca9d65f8d8473a30202b089a))
* **ui:** add accessible pagination navigation and result announcements ([#134](https://github.com/tooinfinity/inertia-datatables/issues/134)) ([d1f9ab3](https://github.com/tooinfinity/inertia-datatables/commit/d1f9ab38b54f14ddad665b73d635318f7c87f18a))
* **ui:** restore three-state sorting and shift-click multi-sorting ([#131](https://github.com/tooinfinity/inertia-datatables/issues/131)) ([ca15e41](https://github.com/tooinfinity/inertia-datatables/commit/ca15e4153d0c97dc07a640f4a463cd64d0aed343))
* **ui:** use accessible menu selection items for filter options ([#135](https://github.com/tooinfinity/inertia-datatables/issues/135)) ([5ca1f52](https://github.com/tooinfinity/inertia-datatables/commit/5ca1f5233b74483f4b8c505260117b69a72ae25d))
* **workbench:** developer environment and test models ([#4](https://github.com/tooinfinity/inertia-datatables/issues/4)) ([5f77c90](https://github.com/tooinfinity/inertia-datatables/commit/5f77c901e8a8de9a3861205b501d03582c73da24))


### Reverts

* remove shadcn maintenance automation ([#150](https://github.com/tooinfinity/inertia-datatables/issues/150)) ([84724ec](https://github.com/tooinfinity/inertia-datatables/commit/84724ec1a2a5aa348e308619d33301761f3b65ba))


### Miscellaneous Chores

* add PR template and PR title lint workflow ([d56a530](https://github.com/tooinfinity/inertia-datatables/commit/d56a530c2a0560abb2693684e0e3ded7d8843dbf))
* add PR title lint workflow with commitlint ([e78fec7](https://github.com/tooinfinity/inertia-datatables/commit/e78fec78422d45606e987daa8ad8143f5247d44a))
* lower minimum PHP requirement to ^8.3 ([#64](https://github.com/tooinfinity/inertia-datatables/issues/64)) ([bc4ac22](https://github.com/tooinfinity/inertia-datatables/commit/bc4ac22f524006d3ec1f7e0ac14554abdd9cf261))
* **registry:** sync distribution artifacts and version alignment ([#5](https://github.com/tooinfinity/inertia-datatables/issues/5)) ([5f5600c](https://github.com/tooinfinity/inertia-datatables/commit/5f5600c4675d653c599f70271cafaa101b1b1de7))
* update dependency ([ae0cec0](https://github.com/tooinfinity/inertia-datatables/commit/ae0cec0ae7b6e85332f81493e77871cb70626703))

## [Unreleased](https://github.com/tooinfinity/inertia-datatables/compare/v0.0.1...HEAD)

### Breaking Changes

- Response `data` now contains only declared columns by default. Add every client-required field to `columns()`, use `->responseKey('id')` to include one additional row key, or use `->exposeAll()` to restore the previous unrestricted response behavior (fixes #29)

### Added

- Benchmarks: CodSpeed performance tracking for the `DataTable` React component (Vitest, `npm run bench`) and server-side DataTable request handling (`composer bench`, `codspeed.yaml`), run on every pull request by `.github/workflows/codspeed.yml`
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

### Changed

- Polished the DataTable registry UI/UX following shadcn/ui data-table patterns: cohesive toolbar layout with filter reset, in-toolbar column visibility, accessible dropdown-driven column filtering, integrated pagination with zero-result boundary handling and row selection feedback, and contained horizontal scrolling (fixes #79)
- The `Column` value object now copies its properties through a single `with()` helper instead of re-instantiating itself with every argument in each fluent method
- Upgraded the frontend registry to TanStack Table v9 with explicit table features and v9-compatible types
- Standardized package and registry metadata on TanStack Table v9

### Fixed

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

- Establish shadcn/ui component ownership boundaries and agent-protection rules for `registry/data-table/components/ui/`, `registry/data-table/components/data-table/`, and generated `public/r/` artifacts.

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

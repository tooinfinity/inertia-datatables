# Inertia Datatables - Code Review Prompt

## Package Overview

**Package:** `tooinfinity/inertia-datatables`
**Purpose:** Server-side DataTables for Laravel + Inertia 3 with React, TanStack Table v8, and shadcn/ui
**Architecture:** Immutable/read-only value objects, fluent builder pattern, query processor with capability-based allowlists

---

## Review Focus Areas

### 1. Correctness Issues

#### Query Processor Logic (`src/Processing/QueryProcessor.php`)

**Column Validation Order**
- Current: `validateColumns()` called first, then filters/searches/sorts applied
- **Check:** Does validation correctly prevent all unauthorized operations before any query modification?
- **Risk:** If validation is bypassed or incomplete, malicious columns could reach `orderBy()`/`where()`

**Filter Application (`applyFilter()` lines 96-126)**
- Boolean handling: strings `"true"/"false"/"1"/"0"` → boolean, but actual boolean values also handled
- Null handling: `"null"/"NULL"` → `whereNull()`, `"not_null"/"NOT_NULL"` → `whereNotNull()`
- Wildcard: `*` → `%` for LIKE queries
- **Check:** Are all filter type coercions safe? Does wildcard replacement create unexpected matches?
- **Edge case:** `filterType === 'boolean'` only handles string values, but boolean values bypass this (line 107)

**Global Search (`applyGlobalSearch()` lines 132-151)**
- Uses `orWhere` with LIKE `%search%` on all searchable columns
- **Check:** Performance with many searchable columns? SQL injection via search value? (Tests show parameter binding used)

**Column Search (`applyColumnSearches()` lines 157-170)**
- Applies `where(column, 'LIKE', "%value%")` sequentially (AND logic)
- **Check:** Is AND logic correct for multiple column searches? Should it be OR?

**Sorting (`applySorting()` lines 176-221)**
- Validates each sort column against allowlist AND sortable capability
- Default sort validated separately
- **Check:** Multiple sorts applied in order? Direction normalization correct?

**Pagination (`resolvePerPage()` lines 257-264)**
- Clamps between 1 and `max_per_page` config
- **Check:** Config fallback to 100 if not set?

#### DataTableRequest Parsing (`src/DataTableRequest.php`)

**Page/PerPage Parsing (lines 28-35)**
- `max(1, (int)$request->query(...))` for page
- `min($maxPerPage, max(1, (int)$request->query(...)))` for perPage
- **Check:** Non-numeric strings become 0 → clamped to 1. Is this desired behavior?

**Search Value Handling (line 38)**
- `$searchQuery = $request->query($queryConfig->search, '');`
- `is_array($searchQuery) ? '' : (string) $searchQuery;`
- **Check:** Silently ignores array input. Should this throw or log?

**Sort Collection Parsing (lines 40-42)**
- `SortCollection::fromQueryString((string) $request->query($queryConfig->sort, ''))`
- **Check:** Empty string handled? Malformed input handled?

#### Column Builder (`src/Column.php`)

**Fluent Methods Return New Instances**
- All mutators (`label()`, `searchable()`, `sortable()`, etc.) return `new self(...)`
- **Check:** All properties copied correctly? No missing fields in any method?

**Filter Options (lines 102-114)**
- `filterOptions()` sets `filterType` to `'select'` if null
- **Check:** Is this the intended default? Does it conflict with explicit `filterType()` calls?

**Label Formatting (line 157)**
- `ucwords(str_replace(['_', '.'], ' ', $name))`
- **Check:** Handles dot notation? (e.g., `user.name` → `User Name`)

---

### 2. Missing Validation

#### Input Validation Gaps

| Location | Missing Validation | Risk |
|----------|-------------------|------|
| `DataTableRequest::fromRequest()` | No validation of `page`/`per_page` being integers before cast | Type juggling |
| `DataTableRequest::fromRequest()` | No validation of `search` length | DoS via huge strings |
| `QueryProcessor::applyFilter()` | No validation of filter value length/type for non-boolean | DoS, unexpected behavior |
| `QueryProcessor::applyGlobalSearch()` | No max length on search string | DoS via huge LIKE patterns |
| `Column::make()` | No validation of column name format | SQL injection via column name if not validated later |
| `SortCollection::fromQueryString()` | No max sorts limit | DoS via many sorts |
| `FilterCollection::fromRequest()` | No max filters limit | DoS via many filters |
| `SearchCollection::fromRequest()` | No max searches limit | DoS via many searches |

#### Capability Validation

- **Current:** `validateColumns()` checks column exists in allowlist + capability (sortable/filterable/searchable)
- **Gap:** No validation that `defaultSortColumn` exists in columns array at `DataTable` construction time
- **Gap:** No validation that `defaultSortDirection` is valid at `DataTable` construction time
- **Gap:** Column `filterType` not validated against known types (`boolean`, `select`, etc.)

#### Config Validation

- `QueryConfig::fromConfig()` assumes config keys exist with string values
- **Check:** What happens if config returns `null` or non-string?

---

### 3. Security Risks

#### SQL Injection Prevention

**Current Defenses (Verified in SecurityTest.php):**
- ✅ Column names validated against server-defined allowlist before use in `orderBy()`/`where()`
- ✅ Values passed as parameters (Laravel query builder parameter binding)
- ✅ Sort directions normalized to `asc`/`desc` only
- ✅ Filter values treated as literals (no raw expressions)
- ✅ Search values used in parameterized `LIKE` queries

**Potential Gaps:**
- **QueryBuilder vs EloquentBuilder:** Both supported. Ensure neither allows raw expressions through column names
- **Column name in `where()`:** Line 125: `$query->where($column->name, $value)` — column name from allowlist, value parameterized ✅
- **Column name in `orderBy()`:** Line 198: `$query->orderBy($defaultColumn->name, $normalizedDirection)` — from allowlist ✅
- **Global search column names:** Line 148: `$q->orWhere($column->name, 'LIKE', "%{$search}%")` — column from allowlist, search value parameterized? **CHECK:** `"%{$search}%"` uses string interpolation, not binding!

**Critical Finding - Global Search SQL Injection Risk:**
```php
// Line 148 in QueryProcessor.php
$q->orWhere($column->name, 'LIKE', "%{$search}%");
```
The search value is **interpolated into the string**, not parameterized. If `$search` contains `%` or `_`, they act as wildcards. If it contains SQL, it's escaped by Laravel's grammar? **Need to verify.**

Laravel's `where()` with `LIKE` operator: the third argument is passed as a parameter binding, so `"%{$search}%"` is treated as a literal value. The `%` wildcards are part of the value, not SQL. **This is safe.** But verify with test.

**Column Search (line 166):**
```php
$query->where($column->name, 'LIKE', "%{$search->value}%");
```
Same pattern — value interpolated into binding. Safe if Laravel parameterizes.

**Filter wildcard (line 120):**
```php
$value = str_replace('*', '%', $value);
return $query->where($column->name, 'LIKE', $value);
```
User-controlled `*` becomes `%`. This is **intentional feature** (wildcard search), not a vulnerability.

#### Mass Assignment / Unauthorized Access

- **Hidden columns:** `hidden` flag is UI-only, does not restrict API access (tests confirm)
- **Check:** Is this documented? Should there be a separate `apiVisible` or similar flag?

#### Information Disclosure

- Exception messages include column names (tested in SecurityTest.php lines 869-902)
- **Risk:** Column names exposed in 500 errors. In production with `APP_DEBUG=false`, this becomes generic 500. **Acceptable?**

#### Rate Limiting / DoS

- No built-in rate limiting on DataTable endpoints
- No max query complexity limits (joins, sorts, filters)
- Large `per_page` clamped but `page` can be huge (returns empty data)
- **Recommendation:** Document that consumers should add rate limiting

---

### 4. Missing Tests

#### Unit Test Coverage Gaps

| Component | Current Coverage | Missing |
|-----------|-----------------|---------|
| `InertiaDataTables` (facade entry) | None | Happy path, query builder vs eloquent |
| `DataTable` (builder) | Feature tests only | Unit tests for each fluent method |
| `DataTableRequest` | Feature tests via HTTP | Unit tests for `fromRequest()` edge cases |
| `QueryConfig` | Feature tests via config | Unit tests for config overrides |
| `Column` | Feature tests via integration | Unit tests for each fluent method, `toArray()`, `jsonSerialize()` |
| `QueryProcessor` | Feature tests via HTTP | Unit tests for each private method |
| `FilterCollection` | Feature tests | Unit tests for `fromRequest()` parsing edge cases |
| `SearchCollection` | Feature tests | Unit tests for both parsing formats |
| `SortCollection` | Feature tests | Unit tests for `fromQueryString()` edge cases |
| Exceptions | SecurityTest checks messages | Unit tests for exception construction |

#### Integration Test Gaps

1. **Eloquent Relationships:** No tests with `with()`, `has()`, or nested queries
2. **Scopes:** No tests with model scopes applied before DataTable
3. **Soft Deletes:** Tests use `softDeletes` in migration but no tests for `withTrashed()`/`onlyTrashed()`
4. **Custom Query Builders:** `makeQbTestRoute` tests basic QB but not complex queries
5. **Select Columns:** No test for `select()` on query before DataTable
6. **Group By / Having:** No tests
7. **Transactions:** No test for DB transaction handling

#### Edge Case Tests Needed

| Scenario | Test Needed? |
|----------|--------------|
| Empty columns array | Yes — what happens? |
| Duplicate column names | Yes — `array_column` with `name` key keeps last |
| Column name collision with reserved words | Yes — `order`, `group`, `select` |
| Unicode in search/filter values | Yes |
| Very deep nesting in query builder | Yes |
| Concurrent requests modifying same data | N/A (stateless) |
| Config published and overridden | Yes |

#### Contract/Architecture Tests

- `ArchTest.php` only checks strict types and forbidden functions
- **Missing:** 
  - All public classes are `final` (mostly true, check `DataTableResult`)
  - All public methods have return types (check)
  - No public properties (all `readonly` with public props — acceptable for DTOs)
  - Interface segregation (no interfaces defined — is this intentional?)

---

### 5. Laravel Best Practices Compliance

#### Service Provider (`InertiaDataTablesServiceProvider.php`)

- ✅ `mergeConfigFrom` for config
- ✅ Singleton for main class
- ✅ Binding for `DataTableRequest` (resolves from request)
- ✅ Publishes config with tags
- ❌ **Missing:** Route registration (if any), view publishing, migration publishing, translation publishing
- ❌ **Missing:** Commands registration (if any)

#### Facade (`Facades/InertiaDataTables.php`)

- ✅ Proper `@see` annotation
- ✅ Minimal facade

#### Config (`config/inertia-datatables.php`)

- ✅ Sensible defaults
- ✅ All keys documented via structure
- ❌ **Missing:** Config validation (e.g., `max_per_page > 0`)

#### Type Safety

- ✅ `declare(strict_types=1)` everywhere
- ✅ PHPDoc generics for templated classes
- ✅ `readonly` classes for immutability
- ✅ Proper type hints
- ❌ **Check:** `mixed` used in `Filter::$value` and `DataTableRequest::$filters` — acceptable?

#### Exception Hierarchy

- All extend `InvalidArgumentException`
- ✅ Specific exception types for different failures
- ✅ Static factory methods for consistent messages
- ❌ **Missing:** Exception codes? HTTP status mapping?

---

### 6. Performance Considerations

#### N+1 Prevention

- Package doesn't load relationships — consumer responsibility
- **Documentation needed:** Consumers must eager-load relations

#### Query Optimization

- Global search: `orWhere` on each searchable column — cannot use index effectively
- Column searches: Sequential `where` — AND logic, each adds condition
- Filters: Sequential `where` — AND logic
- Sorts: Sequential `orderBy` — multiple columns supported
- **Recommendation:** Document query plan implications

#### Memory

- `DataTableResult::jsonSerialize()` calls `array_values($paginator->items())` — loads all page items into array
- For large `per_page`, this duplicates data in memory
- **Acceptable** for typical pagination sizes (≤100)

---

### 7. API Design Consistency

#### Fluent Builder Pattern

- `DataTable::query()` → `columns()` → `defaultSort()` → `perPage()` → `handle()`
- All methods return `new self(...)` — immutable
- **Check:** `handle()` accepts optional `DataTableRequest` — allows testing injection

#### Response Format (`DataTableResult::jsonSerialize()`)

```json
{
  "data": [...],
  "meta": { "current_page", "per_page", "from", "to", "total", "last_page" },
  "query": { "page", "per_page", "search", "sort", "searches", "filters" },
  "columns": [{ "name", "label", "searchable", "sortable", "filterable", "hidden", "filter_type", "filter_options" }],
  "config": { "debounce", "per_page_options" }
}
```

- **Check:** Matches TanStack Table v8 expectations?
- **Check:** `from`/`to` can be `null` — handled in frontend?

---

### 8. Documentation & Developer Experience

#### README.md

- **Check:** Installation instructions
- **Check:** Basic usage example
- **Check:** Column configuration guide
- **Check:** Security model explanation (allowlist)
- **Check:** Custom query parameters
- **Check:** Testing guide

#### Inline Documentation

- PHPDoc on all public methods
- Generic templates for `DataTable<TModel>`, `DataTableResult<T>`, `QueryProcessor<TModel>`
- **Missing:** `@param` descriptions for some methods

---

## Review Checklist for Students

### Critical (Must Fix)

- [ ] **Global search value interpolation** — Verify Laravel parameterizes `LIKE` values safely
- [ ] **Input validation** — Add max length checks on search/filter/sort inputs
- [ ] **Config validation** — Validate config values on load
- [ ] **Default sort validation** — Validate at DataTable construction, not at handle()

### High Priority

- [ ] **Unit tests for all value objects** — Column, Filter, Search, Sort, Collections
- [ ] **Unit tests for QueryProcessor private methods** — isolate logic from HTTP
- [ ] **DoS protection** — Max limits on sorts/filters/searches
- [ ] **Exception handling** — Map exceptions to proper HTTP responses (400 vs 500)

### Medium Priority

- [ ] **Document hidden column behavior** — UI-only, not security
- [ ] **Add config validation** — `max_per_page > 0`, `debounce >= 0`
- [ ] **Test Eloquent scopes and relationships**
- [ ] **Test soft deletes integration**

### Low Priority

- [ ] **Add exception codes**
- [ ] **Consider interface for DataTable contract**
- [ ] **Document query performance characteristics**
- [ ] **Add migration publishing if needed**

---

## How to Run Review Checks

```bash
# Full test suite
composer test

# Unit tests only
composer test:unit

# Type coverage (requires 100%)
composer test:types

# Static analysis
composer analyse

# Lint check
composer lint:check

# Rector check
composer rector:check
```

---

## Questions for the Author

1. **Global Search Interpolation:** Line 148 in `QueryProcessor.php` uses `"%{$search}%"` — confirmed Laravel parameterizes this safely?
2. **Hidden Columns:** Intentionally not a security boundary? Documented?
3. **Filter Types:** Only `boolean` handled specially. Plan for `date`, `number`, `select`?
4. **Default Sort Validation:** Why validated at `handle()` not at `defaultSort()` call?
5. **QueryBuilder Support:** Any known limitations vs EloquentBuilder?
6. **TanStack Table Integration:** Response format finalized? Version compatibility?
7. **Rate Limiting:** Expected to be handled by consumer or package?
8. **Column Name Format:** Restrictions? (dots, spaces, reserved words)

---

## Suggested Review Order

1. **Security** — `QueryProcessor.php` (global search, filter application)
2. **Correctness** — `DataTableRequest.php` (input parsing), `Column.php` (builder)
3. **Validation** — Missing input validation, config validation
4. **Tests** — Unit test gaps, integration test gaps
5. **Laravel Practices** — Service provider, config, exceptions
6. **Performance** — Query patterns, memory
7. **Documentation** — README, inline docs

---

*Generated for educational code review exercise. Focus on actionable findings with file:line references.*
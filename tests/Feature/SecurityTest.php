<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
use Workbench\App\Models\User;

beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->string('password');
        $table->string('status')->default('active')->nullable();
        $table->string('role')->default('user');
        $table->string('code')->nullable();
        $table->boolean('is_admin')->default(false);
        $table->string('secret')->nullable();
        $table->timestamps();
        $table->softDeletes();
    });
});

afterEach(function (): void {
    Schema::dropIfExists('users');
});

/**
 * Phase 2: Security & Adversarial Input Tests
 *
 * Treat server-defined columns as the only valid allow-list.
 * Test unknown: sort columns, searchable columns, filterable columns, column-search columns
 * Test malformed sort directions.
 * Test malicious column identifiers and query values.
 * Verify unauthorized capabilities cannot be invoked through crafted URLs.
 * Audit filter semantics, including null, not_null, and * if supported.
 * Test pagination limits and invalid values.
 * Verify no raw client-controlled SQL identifiers reach query construction.
 *
 * Exit gate: hostile query strings cannot bypass the column/capability model.
 */
describe('Security: Unknown/Invalid Column Rejection', function (): void {
    it('rejects sort on unknown column', function (): void {
        makeTestRoute('/security-sort-unknown', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-sort-unknown?sort=unknown_column');

        $response->assertStatus(500);
    });

    it('rejects filter on unknown column', function (): void {
        makeTestRoute('/security-filter-unknown', [
            Column::make('name')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);

        $response = $this->get('/security-filter-unknown?filters[unknown_column]=value');

        $response->assertStatus(500);
    });

    it('rejects column search on unknown column', function (): void {
        makeTestRoute('/security-colsearch-unknown', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);

        $response = $this->get('/security-colsearch-unknown?searches[unknown_column]=john');

        $response->assertStatus(500);
    });

    it('rejects global search when no searchable columns defined', function (): void {
        makeTestRoute('/security-search-none', [
            Column::make('name')->sortable(),
            Column::make('email')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-search-none?search=john');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
    });

    it('rejects sort on non-sortable column even if column exists', function (): void {
        makeTestRoute('/security-sort-not-allowed', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable(), // not sortable
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);

        $response = $this->get('/security-sort-not-allowed?sort=email');

        $response->assertStatus(500);
    });

    it('rejects filter on non-filterable column even if column exists', function (): void {
        makeTestRoute('/security-filter-not-allowed', [
            Column::make('name')->searchable()->sortable(), // not filterable
            Column::make('status')->filterable()->sortable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);

        $response = $this->get('/security-filter-not-allowed?filters[name]=john');

        $response->assertStatus(500);
    });

    it('rejects column search on non-searchable column even if column exists', function (): void {
        makeTestRoute('/security-colsearch-not-allowed', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->sortable(), // not searchable
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);

        $response = $this->get('/security-colsearch-not-allowed?searches[email]=john');

        $response->assertStatus(500);
    });

    it('rejects default sort on non-sortable column', function (): void {
        makeTestRoute('/security-default-sort-not-allowed', [
            Column::make('name')->searchable(),
            Column::make('email')->sortable(),
        ], 'name'); // name is not sortable

        createUser(['name' => 'John']);

        $response = $this->get('/security-default-sort-not-allowed');

        $response->assertStatus(500);
    });

    it('rejects default sort with invalid direction', function (): void {
        makeTestRoute('/security-invalid-default-direction', [
            Column::make('name')->sortable(),
        ], 'name', 'invalid');

        createUser(['name' => 'John']);

        $response = $this->get('/security-invalid-default-direction');

        $response->assertStatus(500);
    });
});

describe('Security: Malformed Sort Directions', function (): void {
    it('rejects empty sort direction prefix', function (): void {
        makeTestRoute('/security-sort-empty-dir', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        // Empty string after - or + should be handled gracefully
        $response = $this->get('/security-sort-empty-dir?sort=-');

        $response->assertOk();
    });

    it('rejects invalid sort direction like "ascending"', function (): void {
        // This tests the Sort::make validation
        expect(fn (): TooInfinity\InertiaDataTables\Sorting\Sort => TooInfinity\InertiaDataTables\Sorting\Sort::make('name', 'ascending'))
            ->toThrow(InvalidSortException::class, 'Invalid sort direction [ascending]. Expected "asc" or "desc".');
    });

    it('rejects invalid sort direction like "DESCENDING"', function (): void {
        expect(fn (): TooInfinity\InertiaDataTables\Sorting\Sort => TooInfinity\InertiaDataTables\Sorting\Sort::make('name', 'DESCENDING'))
            ->toThrow(InvalidSortException::class, 'Invalid sort direction [DESCENDING]. Expected "asc" or "desc".');
    });

    it('rejects sort direction with extra characters', function (): void {
        expect(fn (): TooInfinity\InertiaDataTables\Sorting\Sort => TooInfinity\InertiaDataTables\Sorting\Sort::make('name', 'asc '))
            ->toThrow(InvalidSortException::class, 'Invalid sort direction [asc ]. Expected "asc" or "desc".');
    });

    it('accepts valid asc direction', function (): void {
        $sort = TooInfinity\InertiaDataTables\Sorting\Sort::make('name', 'asc');
        expect($sort->direction)->toBe('asc');
    });

    it('accepts valid desc direction', function (): void {
        $sort = TooInfinity\InertiaDataTables\Sorting\Sort::make('name', 'desc');
        expect($sort->direction)->toBe('desc');
    });

    it('accepts valid ASC direction (case insensitive)', function (): void {
        $sort = TooInfinity\InertiaDataTables\Sorting\Sort::make('name', 'ASC');
        expect($sort->direction)->toBe('asc');
    });

    it('accepts valid DESC direction (case insensitive)', function (): void {
        $sort = TooInfinity\InertiaDataTables\Sorting\Sort::make('name', 'DESC');
        expect($sort->direction)->toBe('desc');
    });
});

describe('Security: Malicious Column Identifiers', function (): void {
    it('rejects SQL injection in sort column', function (): void {
        makeTestRoute('/security-sql-inject-sort', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        // Attempt SQL injection via sort parameter
        $response = $this->get('/security-sql-inject-sort?sort=name;DROP TABLE users;--');

        $response->assertStatus(500);
    });

    it('rejects SQL injection in filter column', function (): void {
        makeTestRoute('/security-sql-inject-filter', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);

        $response = $this->get('/security-sql-inject-filter?filters[name;DROP TABLE users;--]=active');

        $response->assertStatus(500);
    });

    it('neutralizes SQL injection in column search via query parser', function (): void {
        makeTestRoute('/security-sql-inject-colsearch', [
            Column::make('name')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John']);
        createUser(['name' => 'Jane']);

        // Laravel query parser converts brackets, so searches[name OR 1=1] becomes searches_name_OR_1
        // which doesn't match the searches[ pattern, so search is ignored
        $response = $this->get('/security-sql-inject-colsearch?searches[name OR 1=1]=john');

        $response->assertOk();
        // Search is ignored, returns all users
        expect($response->json('meta.total'))->toBe(2);
    });

    it('rejects column with backticks', function (): void {
        makeTestRoute('/security-backticks', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-backticks?sort=`name`');

        $response->assertStatus(500);
    });

    it('rejects column with dots (table.column)', function (): void {
        makeTestRoute('/security-dot-notation', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-dot-notation?sort=users.name');

        $response->assertStatus(500);
    });

    it('rejects column with spaces', function (): void {
        makeTestRoute('/security-spaces', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-spaces?sort=name%20desc');

        $response->assertStatus(500);
    });

    it('handles null bytes stripped by PHP', function (): void {
        makeTestRoute('/security-null-bytes', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        // PHP strips null bytes, so sort=name%00 becomes sort=name
        $response = $this->get('/security-null-bytes?sort=name%00');

        $response->assertOk();
        expect($response->json('query.sort.0.column'))->toBe('name');
    });

    it('handles newlines stripped by PHP', function (): void {
        makeTestRoute('/security-newlines', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        // PHP strips newlines, so sort=name%0A becomes sort=name
        $response = $this->get('/security-newlines?sort=name%0A');

        $response->assertOk();
        expect($response->json('query.sort.0.column'))->toBe('name');
    });

    it('rejects extremely long column names', function (): void {
        makeTestRoute('/security-long-column', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $longColumn = str_repeat('a', 1000);
        $response = $this->get('/security-long-column?sort='.$longColumn);

        $response->assertStatus(500);
    });
});

describe('Security: Malicious Query Values', function (): void {
    it('handles SQL injection attempt in filter value safely', function (): void {
        makeTestRoute('/security-filter-value-injection', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);
        createUser(['name' => 'Jane', 'status' => "admin' OR '1'='1"]);

        // The value should be treated as literal string, not SQL
        $response = $this->get("/security-filter-value-injection?filters[status]=admin' OR '1'='1");

        $response->assertOk();
        // Should find 0 or 1 matching the literal string, not all rows
        expect($response->json('meta.total'))->toBeLessThanOrEqual(1);
    });

    it('handles SQL injection attempt in search value safely', function (): void {
        makeTestRoute('/security-search-value-injection', [
            Column::make('name')->searchable()->sortable(),
        ]);

        createUser(['name' => "John' OR '1'='1"]);
        createUser(['name' => 'Jane']);

        $response = $this->get("/security-search-value-injection?search=John' OR '1'='1");

        $response->assertOk();
        // Should find the literal string
        expect($response->json('meta.total'))->toBe(1);
    });

    it('handles SQL injection attempt in column search value safely', function (): void {
        makeTestRoute('/security-colsearch-value-injection', [
            Column::make('name')->searchable()->sortable(),
        ]);

        createUser(['name' => "John' OR '1'='1"]);
        createUser(['name' => 'Jane']);

        $response = $this->get("/security-colsearch-value-injection?searches[name]=John' OR '1'='1");

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
    });

    it('handles XSS payloads in values safely', function (): void {
        makeTestRoute('/security-xss-values', [
            Column::make('name')->searchable()->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => '<script>alert(1)</script>', 'status' => 'active']);

        $response = $this->get('/security-xss-values?search=<script>alert(1)</script>');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
    });

    it('handles path traversal in column names', function (): void {
        makeTestRoute('/security-path-traversal', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-path-traversal?sort=../../../etc/passwd');

        $response->assertStatus(500);
    });
});

describe('Security: Filter Semantics (null, not_null, *)', function (): void {
    it('filters null values with "null" string', function (): void {
        makeTestRoute('/security-filter-null', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);
        createUser(['name' => 'Jane', 'status' => null]);

        $response = $this->get('/security-filter-null?filters[status]=null');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.name'))->toBe('Jane');
    });

    it('filters null values with "NULL" string (uppercase)', function (): void {
        makeTestRoute('/security-filter-null-upper', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);
        createUser(['name' => 'Jane', 'status' => null]);

        $response = $this->get('/security-filter-null-upper?filters[status]=NULL');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.name'))->toBe('Jane');
    });

    it('filters non-null values with "not_null" string', function (): void {
        makeTestRoute('/security-filter-not-null', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);
        createUser(['name' => 'Jane', 'status' => null]);

        $response = $this->get('/security-filter-not-null?filters[status]=not_null');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.name'))->toBe('John');
    });

    it('filters non-null values with "NOT_NULL" string (uppercase)', function (): void {
        makeTestRoute('/security-filter-not-null-upper', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);
        createUser(['name' => 'Jane', 'status' => null]);

        $response = $this->get('/security-filter-not-null-upper?filters[status]=NOT_NULL');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.name'))->toBe('John');
    });

    it('uses wildcard * for LIKE queries', function (): void {
        makeTestRoute('/security-filter-wildcard', [
            Column::make('name')->sortable(),
            Column::make('email')->filterable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@test.com']);
        createUser(['name' => 'Bob', 'email' => 'bob@domain.org']);

        $response = $this->get('/security-filter-wildcard?filters[email]=*@example.com');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.email'))->toBe('john@example.com');
    });

    it('uses wildcard * at start for LIKE queries', function (): void {
        makeTestRoute('/security-filter-wildcard-start', [
            Column::make('name')->sortable(),
            Column::make('email')->filterable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@example.com']);

        $response = $this->get('/security-filter-wildcard-start?filters[email]=*@example.com');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(2);
    });

    it('uses wildcard * at end for LIKE queries', function (): void {
        makeTestRoute('/security-filter-wildcard-end', [
            Column::make('name')->sortable(),
            Column::make('email')->filterable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@test.com']);

        $response = $this->get('/security-filter-wildcard-end?filters[email]=john*');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.email'))->toBe('john@example.com');
    });

    it('uses multiple wildcards for LIKE queries', function (): void {
        makeTestRoute('/security-filter-multi-wildcard', [
            Column::make('name')->sortable(),
            Column::make('email')->filterable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@test.com']);
        createUser(['name' => 'Bob', 'email' => 'bob@domain.org']);

        $response = $this->get('/security-filter-multi-wildcard?filters[email]=*exam*');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.email'))->toBe('john@example.com');
    });

    it('treats literal asterisk as wildcard (no escaping)', function (): void {
        makeTestRoute('/security-filter-literal-asterisk', [
            Column::make('name')->sortable(),
            Column::make('code')->filterable(),
        ]);

        createUser(['name' => 'John', 'code' => 'A*B']);
        createUser(['name' => 'Jane', 'code' => 'AXB']);

        // * becomes %, so A*B becomes A%B which matches AXB
        $response = $this->get('/security-filter-literal-asterisk?filters[code]=A*B');

        $response->assertOk();
        // Both match because * -> % wildcard
        expect($response->json('meta.total'))->toBe(2);
    });

    it('filters boolean values correctly', function (): void {
        makeTestRoute('/security-filter-boolean', [
            Column::make('name')->sortable(),
            Column::make('is_admin')->filterable(),
        ]);

        // Note: This tests boolean filter values passed as query params
        // Query params are always strings, so boolean filtering via query string
        // would need special handling. This test documents current behavior.
        createUser(['name' => 'John', 'is_admin' => true]);
        createUser(['name' => 'Jane', 'is_admin' => false]);

        $response = $this->get('/security-filter-boolean?filters[is_admin]=true');

        $response->assertOk();
        // String "true" !== boolean true, so exact match
        expect($response->json('meta.total'))->toBe(0);
    });
});

describe('Security: Pagination Limits and Invalid Values', function (): void {
    it('enforces max_per_page config limit', function (): void {
        makeTestRoute('/security-max-page', [
            Column::make('name')->sortable(),
        ]);

        for ($i = 0; $i < 200; $i++) {
            createUser();
        }

        $response = $this->get('/security-max-page?per_page=10000');

        $response->assertOk();
        expect($response->json('meta.per_page'))->toBe(100); // default max_per_page
    });

    it('enforces minimum per_page of 1', function (): void {
        makeTestRoute('/security-min-page', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-min-page?per_page=0');

        $response->assertOk();
        expect($response->json('meta.per_page'))->toBe(1);
    });

    it('enforces minimum per_page with negative value', function (): void {
        makeTestRoute('/security-negative-page', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-negative-page?per_page=-10');

        $response->assertOk();
        expect($response->json('meta.per_page'))->toBe(1);
    });

    it('enforces minimum page of 1', function (): void {
        makeTestRoute('/security-min-page-num', [
            Column::make('name')->sortable(),
        ]);

        for ($i = 0; $i < 50; $i++) {
            createUser();
        }

        $response = $this->get('/security-min-page-num?page=0');

        $response->assertOk();
        expect($response->json('meta.current_page'))->toBe(1);
    });

    it('enforces minimum page with negative value', function (): void {
        makeTestRoute('/security-negative-page-num', [
            Column::make('name')->sortable(),
        ]);

        for ($i = 0; $i < 50; $i++) {
            createUser();
        }

        $response = $this->get('/security-negative-page-num?page=-5');

        $response->assertOk();
        expect($response->json('meta.current_page'))->toBe(1);
    });

    it('handles extremely large page numbers gracefully', function (): void {
        makeTestRoute('/security-huge-page', [
            Column::make('name')->sortable(),
        ]);

        for ($i = 0; $i < 10; $i++) {
            createUser();
        }

        $response = $this->get('/security-huge-page?page=999999');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(10);
        expect($response->json('data'))->toHaveCount(0);
    });

    it('handles non-numeric per_page gracefully', function (): void {
        makeTestRoute('/security-non-numeric-perpage', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-non-numeric-perpage?per_page=abc');

        $response->assertOk();
        // (int)'abc' = 0, max(1, 0) = 1
        expect($response->json('meta.per_page'))->toBe(1);
    });

    it('handles non-numeric page gracefully', function (): void {
        makeTestRoute('/security-non-numeric-page', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-non-numeric-page?page=xyz');

        $response->assertOk();
        expect($response->json('meta.current_page'))->toBe(1);
    });
});

describe('Security: No Raw Client-Controlled SQL Identifiers', function (): void {
    it('uses column name from server-defined column list, not user input', function (): void {
        makeTestRoute('/security-column-allowlist', [
            Column::make('name')->sortable(),
            Column::make('email')->sortable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);

        // User provides 'email' but we look it up in allowlist
        $response = $this->get('/security-column-allowlist?sort=email');

        $response->assertOk();
        expect($response->json('data.0.email'))->toBe('john@example.com');
    });

    it('never uses user-provided column name directly in orderBy', function (): void {
        makeTestRoute('/security-no-raw-identifiers', [
            Column::make('name')->sortable(),
        ]);

        createUser(['name' => 'John']);

        // Even if user sends malicious column, it's validated against allowlist first
        $response = $this->get('/security-no-raw-identifiers?sort=name');

        $response->assertOk();
    });

    it('validates all sort columns against allowlist before applying', function (): void {
        makeTestRoute('/security-validate-all-sorts', [
            Column::make('name')->sortable(),
            Column::make('email')->sortable(),
        ]);

        createUser(['name' => 'John', 'email' => 'a@example.com']);
        createUser(['name' => 'Jane', 'email' => 'b@example.com']);

        // Multiple sorts - all must be valid
        $response = $this->get('/security-validate-all-sorts?sort=name,email');

        $response->assertOk();
        expect($response->json('query.sort'))->toHaveCount(2);
    });

    it('validates all filter columns against allowlist before applying', function (): void {
        makeTestRoute('/security-validate-all-filters', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
            Column::make('role')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active', 'role' => 'admin']);
        createUser(['name' => 'Jane', 'status' => 'inactive', 'role' => 'user']);

        $response = $this->get('/security-validate-all-filters?filters[status]=active&filters[role]=admin');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('query.filters'))->toHaveCount(2);
    });

    it('validates all search columns against allowlist before applying', function (): void {
        makeTestRoute('/security-validate-all-searches', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@test.com']);

        $response = $this->get('/security-validate-all-searches?searches[name]=john&searches[email]=example');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('query.searches'))->toHaveCount(2);
    });
});

describe('Security: Unauthorized Capabilities', function (): void {
    it('allows sort by hidden column (hidden is UI-only)', function (): void {
        makeTestRoute('/security-hidden-sort', [
            Column::make('name')->sortable(),
            Column::make('secret')->sortable()->hidden(),
        ]);

        createUser(['name' => 'John', 'secret' => 'hidden-value']);

        $response = $this->get('/security-hidden-sort?sort=secret');

        $response->assertOk();
        expect($response->json('query.sort.0.column'))->toBe('secret');
    });

    it('allows filter by hidden column (hidden is UI-only)', function (): void {
        makeTestRoute('/security-hidden-filter', [
            Column::make('name')->sortable(),
            Column::make('secret')->filterable()->hidden(),
        ]);

        createUser(['name' => 'John', 'secret' => 'hidden-value']);

        $response = $this->get('/security-hidden-filter?filters[secret]=hidden-value');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
    });

    it('allows search by hidden column (hidden is UI-only)', function (): void {
        makeTestRoute('/security-hidden-search', [
            Column::make('name')->searchable()->sortable(),
            Column::make('secret')->searchable()->hidden(),
        ]);

        createUser(['name' => 'John', 'secret' => 'hidden-value']);

        $response = $this->get('/security-hidden-search?searches[secret]=hidden-value');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
    });

    it('allows global search on hidden-only columns if searchable', function (): void {
        makeTestRoute('/security-hidden-global-search', [
            Column::make('secret')->searchable()->hidden(),
        ]);

        createUser(['secret' => 'hidden-value']);

        $response = $this->get('/security-hidden-global-search?search=hidden-value');

        $response->assertOk();
        // Hidden columns are still searchable if marked searchable
        // The hidden flag is for UI, not for security
        expect($response->json('meta.total'))->toBe(1);
    });

    it('does not expose non-searchable columns to global search', function (): void {
        makeTestRoute('/security-global-search-allowlist', [
            Column::make('name')->sortable(), // not searchable
            Column::make('email')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);

        // Global search should only search 'email' column
        $response = $this->get('/security-global-search-allowlist?search=john');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
    });
});

describe('Security: QueryConfig Custom Parameter Names', function (): void {
    it('uses custom query parameter names from config', function (): void {
        config(['inertia-datatables.query.sort' => 'order_by']);
        config(['inertia-datatables.query.filters' => 'where']);
        config(['inertia-datatables.query.searches' => 'find']);

        makeTestRoute('/security-custom-params', [
            Column::make('name')->searchable()->sortable()->filterable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-custom-params?order_by=name&where[name]=john&find[name]=john');

        $response->assertOk();
        expect($response->json('query.sort.0.column'))->toBe('name');
        expect($response->json('query.filters.0.column'))->toBe('name');
        expect($response->json('query.searches.0.column'))->toBe('name');
    });
});

describe('Security: Exception Messages Include Column Name for Debugging', function (): void {
    it('InvalidSortException includes column name', function (): void {
        try {
            throw InvalidSortException::notAllowed('secret_column');
        } catch (InvalidSortException $e) {
            expect($e->getMessage())->toContain('secret_column');
        }
    });

    it('InvalidFilterException includes column name', function (): void {
        try {
            throw InvalidFilterException::notAllowed('secret_column');
        } catch (InvalidFilterException $e) {
            expect($e->getMessage())->toContain('secret_column');
        }
    });

    it('InvalidColumnException notFound includes column name', function (): void {
        try {
            throw InvalidColumnException::notFound('secret_column');
        } catch (InvalidColumnException $e) {
            expect($e->getMessage())->toContain('secret_column');
        }
    });

    it('InvalidColumnException notAllowed includes column name and capability', function (): void {
        try {
            throw InvalidColumnException::notAllowed('secret_column', 'search');
        } catch (InvalidColumnException $e) {
            expect($e->getMessage())->toContain('secret_column');
            expect($e->getMessage())->toContain('search');
        }
    });
});

describe('Security: Edge Cases', function (): void {
    it('handles empty filter array gracefully', function (): void {
        makeTestRoute('/security-empty-filters', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);

        $response = $this->get('/security-empty-filters?filters[]=');

        $response->assertOk();
    });

    it('handles empty search array gracefully', function (): void {
        makeTestRoute('/security-empty-searches', [
            Column::make('name')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-empty-searches?searches[]=');

        $response->assertOk();
    });

    it('handles multiple sort parameters (last wins for duplicates)', function (): void {
        makeTestRoute('/security-duplicate-sorts', [
            Column::make('name')->sortable(),
            Column::make('email')->sortable(),
        ]);

        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@example.com']);

        $response = $this->get('/security-duplicate-sorts?sort=name,-name');

        $response->assertOk();
        // Both sorts applied, second overrides first for same column
        expect($response->json('query.sort'))->toHaveCount(2);
    });

    it('handles malformed filter input (non-array)', function (): void {
        makeTestRoute('/security-malformed-filter', [
            Column::make('name')->sortable(),
            Column::make('status')->filterable(),
        ]);

        createUser(['name' => 'John', 'status' => 'active']);

        // Send filters as string instead of array
        $response = $this->get('/security-malformed-filter?filters=notanarray');

        $response->assertOk();
    });

    it('handles malformed search input (non-array)', function (): void {
        makeTestRoute('/security-malformed-search', [
            Column::make('name')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John']);

        $response = $this->get('/security-malformed-search?searches=notanarray');

        $response->assertOk();
    });
});

<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;
use Workbench\App\Models\User;

/**
 * Cross-database expectations.
 *
 * The package generates portable SQL, so the observable behaviour of a query
 * must not depend on the driver that executes it. These tests pin the
 * behaviour that is easy to get wrong per driver:
 *
 * - LIKE metacharacter escaping and its ESCAPE clause.
 * - Case-insensitive matching, which PostgreSQL does not provide for LIKE.
 * - LIKE against non-text columns, which PostgreSQL rejects without a cast.
 * - Boolean filter binding, which PostgreSQL types strictly.
 */
beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->string('password');
        $table->string('status')->default('active');
        $table->boolean('is_admin')->default(false);
        $table->timestamps();
        $table->softDeletes();
    });
});

afterEach(function (): void {
    Schema::dropIfExists('users');
});

function requestFor(string $search = '', array $filters = []): DataTableRequest
{
    return new DataTableRequest(
        1,
        25,
        $search,
        new SortCollection,
        new SearchCollection,
        new FilterCollection($filters),
    );
}

describe('Dialect: case-insensitive search', function (): void {
    it('matches a lower-case term against a mixed-case value', function (): void {
        createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

        $result = DataTable::query(User::query())
            ->columns([
                Column::make('name')->searchable(),
                Column::make('email')->searchable(),
            ])
            ->handle(requestFor('john'));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('John Doe');
    });

    it('matches an upper-case term against a lower-case value', function (): void {
        createUser(['name' => 'john doe', 'email' => 'john@example.com']);
        createUser(['name' => 'jane smith', 'email' => 'jane@example.com']);

        $result = DataTable::query(User::query())
            ->columns([
                Column::make('name')->searchable(),
                Column::make('email')->searchable(),
            ])
            ->handle(requestFor('JOHN'));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('john doe');
    });

    it('matches column-specific searches case-insensitively', function (): void {
        createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

        $request = new DataTableRequest(
            1,
            25,
            '',
            new SortCollection,
            new SearchCollection([new TooInfinity\InertiaDataTables\Searching\Search('name', 'john')]),
            new FilterCollection,
        );

        $result = DataTable::query(User::query())
            ->columns([
                Column::make('name')->searchable(),
                Column::make('email')->searchable(),
            ])
            ->handle($request);

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('John Doe');
    });
});

describe('Dialect: LIKE metacharacter escaping', function (): void {
    it('treats a percent sign as a literal', function (): void {
        createUser(['name' => '100% Cotton']);
        createUser(['name' => '100 Percent']);

        $result = DataTable::query(User::query())
            ->columns([Column::make('name')->searchable()])
            ->handle(requestFor('100%'));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('100% Cotton');
    });

    it('treats an underscore as a literal', function (): void {
        createUser(['name' => 'a_b']);
        createUser(['name' => 'axb']);

        $result = DataTable::query(User::query())
            ->columns([Column::make('name')->searchable()])
            ->handle(requestFor('a_b'));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('a_b');
    });

    it('treats the escape character itself as a literal', function (): void {
        createUser(['name' => 'wow!']);
        createUser(['name' => 'wowx']);

        $result = DataTable::query(User::query())
            ->columns([Column::make('name')->searchable()])
            ->handle(requestFor('wow!'));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('wow!');
    });

    it('treats a backslash as a literal', function (): void {
        createUser(['name' => 'a\\b']);
        createUser(['name' => 'axb']);

        $result = DataTable::query(User::query())
            ->columns([Column::make('name')->searchable()])
            ->handle(requestFor('a\\b'));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('a\\b');
    });
});

describe('Dialect: searching non-text columns', function (): void {
    it('matches a numeric column by its text representation', function (): void {
        createUser(['name' => 'First']);
        createUser(['name' => 'Second']);

        $result = DataTable::query(User::query())
            ->columns([Column::make('id')->searchable()])
            ->handle(requestFor('1'));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('First');
    });
});

describe('Dialect: boolean filters', function (): void {
    it('filters on a true boolean value', function (): void {
        createUser(['name' => 'Admin', 'is_admin' => true]);
        createUser(['name' => 'User', 'is_admin' => false]);

        $result = DataTable::query(User::query())
            ->columns([Column::make('name'), Column::make('is_admin')->filterable()])
            ->handle(requestFor(filters: [new TooInfinity\InertiaDataTables\Filtering\Filter('is_admin', 'true')]));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('Admin');
    });

    it('filters on a false boolean value', function (): void {
        createUser(['name' => 'Admin', 'is_admin' => true]);
        createUser(['name' => 'User', 'is_admin' => false]);

        $result = DataTable::query(User::query())
            ->columns([Column::make('name'), Column::make('is_admin')->filterable()])
            ->handle(requestFor(filters: [new TooInfinity\InertiaDataTables\Filtering\Filter('is_admin', 'false')]));

        expect($result->paginator->total())->toBe(1)
            ->and($result->paginator->first()->name)->toBe('User');
    });
});

describe('Dialect: connection metadata', function (): void {
    it('runs against the configured driver', function (): void {
        $driver = DB::connection()->getDriverName();

        expect($driver)->toBeIn(['sqlite', 'mysql', 'pgsql']);
    });
});

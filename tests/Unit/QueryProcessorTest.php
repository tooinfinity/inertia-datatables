<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
use TooInfinity\InertiaDataTables\Processing\QueryProcessor;
use Workbench\App\Models\User;

beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->string('password');
        $table->string('status')->default('active')->nullable();
        $table->string('role')->default('user');
        $table->boolean('is_admin')->default(false);
        $table->timestamps();
        $table->softDeletes();
    });
});

afterEach(function (): void {
    Schema::dropIfExists('users');
});

describe('QueryProcessor', function (): void {
    $columns = [
        Column::make('name')->searchable()->sortable()->filterable(),
        Column::make('email')->searchable()->sortable()->filterable(),
        Column::make('status')->filterable()->sortable(),
        Column::make('role')->filterable(),
        Column::make('is_admin')->filterable()->filterType('boolean'),
        Column::make('created_at')->sortable(),
    ];

    $processor = new QueryProcessor($columns);

    it('applies global search across searchable columns', function () use ($processor): void {
        createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

        $query = User::query();
        $request = new DataTableRequest(1, 25, 'john', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('John Doe');
    });

    it('returns all results when search is empty', function () use ($processor): void {
        createUser(['name' => 'John']);
        createUser(['name' => 'Jane']);

        $query = User::query();
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(2);
    });

    it('applies column-specific searches', function () use ($processor): void {
        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@test.com']);

        $query = User::query();
        $searches = new TooInfinity\InertiaDataTables\Searching\SearchCollection([new TooInfinity\InertiaDataTables\Searching\Search('name', 'john')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, $searches, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('John');
    });

    it('throws exception for column search on non-searchable column', function () use ($processor): void {
        $query = User::query();
        $searches = new TooInfinity\InertiaDataTables\Searching\SearchCollection([new TooInfinity\InertiaDataTables\Searching\Search('status', 'active')]); // status is not searchable
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, $searches, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process($query, $request))
            ->toThrow(InvalidColumnException::class, 'Column [status] is not allowed for search.');
    });

    it('applies filters with exact match', function () use ($processor): void {
        createUser(['name' => 'John', 'status' => 'active']);
        createUser(['name' => 'Jane', 'status' => 'inactive']);

        $query = User::query();
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('status', 'active')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->status)->toBe('active');
    });

    it('applies boolean filter with string true/false', function () use ($processor): void {
        createUser(['name' => 'John', 'is_admin' => true]);
        createUser(['name' => 'Jane', 'is_admin' => false]);

        $query = User::query();
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('is_admin', 'true')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        // SQLite returns 1/0 for boolean, which casts to true/false in PHP
        expect($result->paginator->first()->is_admin)->toBeTruthy();
    });

    it('applies boolean filter with string false', function () use ($processor): void {
        createUser(['name' => 'John', 'is_admin' => true]);
        createUser(['name' => 'Jane', 'is_admin' => false]);

        $query = User::query();
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('is_admin', 'false')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->is_admin)->toBeFalsy();
    });

    it('applies null filter', function () use ($processor): void {
        createUser(['name' => 'John', 'status' => 'active']);
        createUser(['name' => 'Jane', 'status' => null]);

        $query = User::query();
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('status', 'null')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->status)->toBeNull();
    });

    it('applies not_null filter', function () use ($processor): void {
        createUser(['name' => 'John', 'status' => 'active']);
        createUser(['name' => 'Jane', 'status' => null]);

        $query = User::query();
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('status', 'not_null')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->status)->toBe('active');
    });

    it('applies wildcard filter', function () use ($processor): void {
        createUser(['name' => 'John', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane', 'email' => 'jane@test.com']);

        $query = User::query();
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('email', '*@example.com')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->email)->toBe('john@example.com');
    });

    it('escapes raw % and _ inputs in global search', function () use ($processor): void {
        Illuminate\Support\Facades\DB::enableQueryLog();

        $query = User::query();
        $request = new DataTableRequest(1, 25, '100%_test', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);
        $processor->process($query, $request);

        $queries = Illuminate\Support\Facades\DB::getQueryLog();
        Illuminate\Support\Facades\DB::disableQueryLog();

        $lastQuery = end($queries);
        expect($lastQuery['bindings'])->toContain('%100\\%\\_test%');
    });

    it('escapes raw % and _ inputs in column search', function () use ($processor): void {
        Illuminate\Support\Facades\DB::enableQueryLog();

        $query = User::query();
        $searches = new TooInfinity\InertiaDataTables\Searching\SearchCollection([new TooInfinity\InertiaDataTables\Searching\Search('name', 'col%_test')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, $searches, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);
        $processor->process($query, $request);

        $queries = Illuminate\Support\Facades\DB::getQueryLog();
        Illuminate\Support\Facades\DB::disableQueryLog();

        $lastQuery = end($queries);
        expect($lastQuery['bindings'])->toContain('%col\\%\\_test%');
    });

    it('escapes raw % and _ inputs in wildcard filtering', function () use ($processor): void {
        Illuminate\Support\Facades\DB::enableQueryLog();

        $query = User::query();
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('email', '100%_*')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);
        $processor->process($query, $request);

        $queries = Illuminate\Support\Facades\DB::getQueryLog();
        Illuminate\Support\Facades\DB::disableQueryLog();

        $lastQuery = end($queries);
        expect($lastQuery['bindings'])->toContain('100\\%\\_%');
    });

    it('applies sorting with single column', function () use ($processor): void {
        createUser(['name' => 'Zebra']);
        createUser(['name' => 'Alpha']);

        $query = User::query();
        $sorts = new TooInfinity\InertiaDataTables\Sorting\SortCollection([new TooInfinity\InertiaDataTables\Sorting\Sort('name', 'asc')]);
        $request = new DataTableRequest(1, 25, '', $sorts, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->first()->name)->toBe('Alpha');
    });

    it('applies sorting with multiple columns', function () use ($processor): void {
        createUser(['name' => 'Zebra', 'email' => 'a@example.com']);
        createUser(['name' => 'Alpha', 'email' => 'z@example.com']);
        createUser(['name' => 'Alpha', 'email' => 'a2@example.com']);

        $query = User::query();
        $sorts = new TooInfinity\InertiaDataTables\Sorting\SortCollection([
            new TooInfinity\InertiaDataTables\Sorting\Sort('name', 'asc'),
            new TooInfinity\InertiaDataTables\Sorting\Sort('email', 'desc'),
        ]);
        $request = new DataTableRequest(1, 25, '', $sorts, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->getCollection()->first()->name)->toBe('Alpha');
        expect($result->paginator->getCollection()->first()->email)->toBe('z@example.com');
    });

    it('applies default sort when no sort provided', function () use ($processor): void {
        createUser(['name' => 'Zebra']);
        createUser(['name' => 'Alpha']);

        $query = User::query();
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request, 'name', 'asc');

        expect($result->paginator->first()->name)->toBe('Alpha');
    });

    it('resolves perPage from request when no override', function () use ($processor): void {
        createUser(['name' => 'User 1']);
        createUser(['name' => 'User 2']);
        createUser(['name' => 'User 3']);
        createUser(['name' => 'User 4']);
        createUser(['name' => 'User 5']);

        $query = User::query();
        $request = new DataTableRequest(1, 10, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->perPage())->toBe(10);
    });

    it('uses perPage override when provided', function () use ($processor): void {
        createUser(['name' => 'User 1']);
        createUser(['name' => 'User 2']);
        createUser(['name' => 'User 3']);
        createUser(['name' => 'User 4']);
        createUser(['name' => 'User 5']);

        $query = User::query();
        $request = new DataTableRequest(1, 10, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request, null, 'desc', 3);

        expect($result->paginator->perPage())->toBe(3);
    });

    it('clamps perPage to max_per_page config', function () use ($processor): void {
        createUser(['name' => 'User 1']);
        createUser(['name' => 'User 2']);
        createUser(['name' => 'User 3']);
        createUser(['name' => 'User 4']);
        createUser(['name' => 'User 5']);

        $query = User::query();
        $request = new DataTableRequest(1, 1000, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->perPage())->toBe(100); // default max_per_page
    });

    it('clamps perPage to minimum of 1', function () use ($processor): void {
        createUser(['name' => 'John']);

        $query = User::query();
        $request = new DataTableRequest(1, -10, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->perPage())->toBe(1);
    });

    it('returns correct columns metadata', function () use ($processor): void {
        $query = User::query();
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        $resultColumns = $result->columns;
        expect($resultColumns)->toHaveCount(6);

        $nameColumn = collect($resultColumns)->firstWhere('name', 'name');
        expect($nameColumn['searchable'])->toBeTrue();
        expect($nameColumn['sortable'])->toBeTrue();
        expect($nameColumn['filterable'])->toBeTrue();

        $emailColumn = collect($resultColumns)->firstWhere('name', 'email');
        expect($emailColumn['searchable'])->toBeTrue();
        expect($emailColumn['sortable'])->toBeTrue();
        expect($emailColumn['filterable'])->toBeTrue();

        $roleColumn = collect($resultColumns)->firstWhere('name', 'role');
        expect($roleColumn['filterable'])->toBeTrue();
        expect($roleColumn['sortable'])->toBeFalse();
    });

    it('returns correct query state in result', function () use ($processor): void {
        $query = User::query();
        $sorts = new TooInfinity\InertiaDataTables\Sorting\SortCollection([new TooInfinity\InertiaDataTables\Sorting\Sort('name', 'desc')]);
        $searches = new TooInfinity\InertiaDataTables\Searching\SearchCollection([new TooInfinity\InertiaDataTables\Searching\Search('email', 'example')]);
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('status', 'active')]);
        $request = new DataTableRequest(2, 15, 'test', $sorts, $searches, $filters);

        $result = $processor->process($query, $request);

        expect($result->query['page'])->toBe(2);
        expect($result->query['per_page'])->toBe(15);
        expect($result->query['search'])->toBe('test');
        expect($result->query['sort'])->toHaveCount(1);
        expect($result->query['sort'][0]['column'])->toBe('name');
        expect($result->query['sort'][0]['direction'])->toBe('desc');
        expect($result->query['searches'])->toHaveCount(1);
        expect($result->query['searches'][0]['column'])->toBe('email');
        expect($result->query['searches'][0]['value'])->toBe('example');
        expect($result->query['filters'])->toHaveCount(1);
        expect($result->query['filters'][0]['column'])->toBe('status');
        expect($result->query['filters'][0]['value'])->toBe('active');
    });

    it('returns config with debounce and per_page_options', function () use ($processor): void {
        $query = User::query();
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->config)->toHaveKeys(['debounce', 'per_page_options']);
        expect($result->config['debounce'])->toBeInt();
        expect($result->config['per_page_options'])->toBeArray();
    });

    it('works with QueryBuilder', function () use ($processor): void {
        createUser(['name' => 'John']);

        $query = DB::table('users');
        $request = new DataTableRequest(1, 25, 'john', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
    });

    it('throws exception for unknown column in sort', function () use ($processor): void {
        $query = User::query();
        $sorts = new TooInfinity\InertiaDataTables\Sorting\SortCollection([new TooInfinity\InertiaDataTables\Sorting\Sort('unknown_column', 'asc')]);
        $request = new DataTableRequest(1, 25, '', $sorts, new TooInfinity\InertiaDataTables\Searching\SearchCollection, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process($query, $request))
            ->toThrow(InvalidSortException::class, 'Column [unknown_column] is not sortable.');
    });

    it('throws exception for unknown column in filter', function () use ($processor): void {
        $query = User::query();
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('unknown_column', 'value')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, new TooInfinity\InertiaDataTables\Searching\SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process($query, $request))
            ->toThrow(InvalidFilterException::class, 'Column [unknown_column] is not filterable.');
    });

    it('throws exception for unknown column in search', function () use ($processor): void {
        $query = User::query();
        $searches = new TooInfinity\InertiaDataTables\Searching\SearchCollection([new TooInfinity\InertiaDataTables\Searching\Search('unknown_column', 'value')]);
        $request = new DataTableRequest(1, 25, '', new TooInfinity\InertiaDataTables\Sorting\SortCollection, $searches, new TooInfinity\InertiaDataTables\Filtering\FilterCollection);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process($query, $request))
            ->toThrow(InvalidColumnException::class, 'Column [unknown_column] is not allowed for search.');
    });

    it('combines global search, column search, filter, and sort', function () use ($processor): void {
        createUser(['name' => 'John Active', 'email' => 'john@active.com', 'status' => 'active']);
        createUser(['name' => 'John Inactive', 'email' => 'john@inactive.com', 'status' => 'inactive']);
        createUser(['name' => 'Jane Active', 'email' => 'jane@active.com', 'status' => 'active']);

        $query = User::query();
        $sorts = new TooInfinity\InertiaDataTables\Sorting\SortCollection([new TooInfinity\InertiaDataTables\Sorting\Sort('email', 'asc')]);
        $searches = new TooInfinity\InertiaDataTables\Searching\SearchCollection([new TooInfinity\InertiaDataTables\Searching\Search('name', 'john')]);
        $filters = new TooInfinity\InertiaDataTables\Filtering\FilterCollection([new TooInfinity\InertiaDataTables\Filtering\Filter('status', 'active')]);
        $request = new DataTableRequest(1, 25, '', $sorts, $searches, $filters);

        $result = $processor->process($query, $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->email)->toBe('john@active.com');
    });
});

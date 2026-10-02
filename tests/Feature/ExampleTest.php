<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\DataTableResult;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
use TooInfinity\InertiaDataTables\Filtering\Filter;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\InertiaDataTables;
use TooInfinity\InertiaDataTables\Searching\Search;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\Sort;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;
use Workbench\App\Models\User;

beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->string('password');
        $table->string('status')->default('active');
        $table->timestamps();
    });
});

afterEach(function (): void {
    Schema::dropIfExists('users');
});

it('resolves the singleton', function (): void {
    expect(app(InertiaDataTables::class))->toBeInstanceOf(InertiaDataTables::class);
});

it('returns the same instance from the container', function (): void {
    expect(app(InertiaDataTables::class))->toBe(app(InertiaDataTables::class));
});

it('merges the package config', function (): void {
    expect(config('inertia-datatables.default_per_page'))->toBe(25);
    expect(config('inertia-datatables.max_per_page'))->toBe(100);
});

it('creates a DataTable from query', function (): void {
    createUser([
        'name' => 'John Doe',
        'email' => 'john@example.com',
    ]);

    $table = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
            Column::make('created_at')->sortable(),
        ])
        ->defaultSort('created_at', 'desc')
        ->handle();

    expect($table)->toBeInstanceOf(DataTableResult::class)
        ->and($table->paginator->total())->toBe(1)
        ->and($table->paginator->items())->toHaveCount(1)
        ->and($table->columns)->toHaveCount(4);
});

it('applies pagination', function (): void {
    for ($i = 0; $i < 50; $i++) {
        createUser();
    }

    $table = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ])
        ->perPage(10)
        ->handle();

    expect($table->paginator->perPage())->toBe(10)
        ->and($table->paginator->total())->toBe(50)
        ->and($table->paginator->lastPage())->toBe(5);
});

it('applies global search', function (): void {
    createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
    createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: 'john',
        sorts: new SortCollection,
        searches: new SearchCollection,
        filters: new FilterCollection,
    );

    $table = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ])
        ->handle($request);

    expect($table->paginator->total())->toBe(1);
    expect($table->paginator->items()[0]->name)->toBe('John Doe');
});

it('applies column sorting', function (): void {
    createUser(['name' => 'Zebra', 'email' => 'zebra@example.com']);
    createUser(['name' => 'Alpha', 'email' => 'alpha@example.com']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: '',
        sorts: new SortCollection([new Sort('name', 'asc')]),
        searches: new SearchCollection,
        filters: new FilterCollection,
    );

    $table = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ])
        ->handle($request);

    expect($table->paginator->items()[0]->name)->toBe('Alpha');
    expect($table->paginator->items()[1]->name)->toBe('Zebra');
});

it('applies column filtering', function (): void {
    createUser(['name' => 'John', 'status' => 'active']);
    createUser(['name' => 'Jane', 'status' => 'inactive']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: '',
        sorts: new SortCollection,
        searches: new SearchCollection,
        filters: new FilterCollection([new Filter('status', 'active')]),
    );

    $table = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ])
        ->handle($request);

    expect($table->paginator->total())->toBe(1)
        ->and($table->paginator->items()[0]->status)->toBe('active');
});

it('throws exception for non-sortable column', function (): void {
    createUser(['name' => 'John']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: '',
        sorts: new SortCollection([new Sort('email', 'asc')]),
        searches: SearchCollection::make(),
        filters: FilterCollection::make(),
    );

    expect(fn (): DataTableResult => DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable(), // not sortable
        ])
        ->handle($request),
    )->toThrow(InvalidSortException::class);
});

it('throws exception for non-filterable column', function (): void {
    createUser(['name' => 'John', 'status' => 'active']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: '',
        sorts: SortCollection::make(),
        searches: SearchCollection::make(),
        filters: FilterCollection::make([new Filter('name', 'John')]),
    );

    expect(fn (): DataTableResult => DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(), // not filterable
            Column::make('status')->filterable()->sortable(),
        ])
        ->handle($request),
    )->toThrow(InvalidFilterException::class);
});

it('throws exception for non-searchable column in column search', function (): void {
    createUser(['name' => 'John']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: '',
        sorts: SortCollection::make(),
        searches: SearchCollection::make([new Search('email', 'john')]),
        filters: FilterCollection::make(),
    );

    expect(fn (): DataTableResult => DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->sortable(), // not searchable
        ])
        ->handle($request),
    )->toThrow(InvalidColumnException::class);
});

it('enforces max per page', function (): void {
    for ($i = 0; $i < 200; $i++) {
        createUser();
    }

    $request = new DataTableRequest(
        page: 1,
        perPage: 10000, // exceeds max_per_page
        search: '',
        sorts: SortCollection::make(),
        searches: SearchCollection::make(),
        filters: FilterCollection::make(),
    );

    $table = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
        ])
        ->handle($request);

    expect($table->paginator->perPage())->toBe(100); // max_per_page
});

it('handles empty results correctly with null from/to', function (): void {
    $table = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
        ])
        ->handle();

    expect($table->paginator->total())->toBe(0)
        ->and($table->paginator->firstItem())->toBeNull()
        ->and($table->paginator->lastItem())->toBeNull()
        ->and($table->toArray()['meta']['from'])->toBeNull()
        ->and($table->toArray()['meta']['to'])->toBeNull()
        ->and($table->toArray()['meta']['total'])->toBe(0)
        ->and($table->toArray()['meta']['last_page'])->toBe(1)
        ->and($table->toArray()['meta']['current_page'])->toBe(1);
});

it('works with QueryBuilder', function (): void {
    for ($i = 0; $i < 10; $i++) {
        createUser();
    }

    $table = DataTable::query(DB::table('users'))
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
            Column::make('created_at')->sortable(),
        ])
        ->defaultSort('created_at', 'desc')
        ->handle();

    expect($table)->toBeInstanceOf(DataTableResult::class)
        ->and($table->paginator->total())->toBe(10)
        ->and($table->paginator->items())->toHaveCount(10)
        ->and($table->columns)->toHaveCount(4);
});

it('applies global search with QueryBuilder', function (): void {
    createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
    createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: 'john',
        sorts: new SortCollection,
        searches: new SearchCollection,
        filters: new FilterCollection,
    );

    $table = DataTable::query(DB::table('users'))
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ])
        ->handle($request);

    expect($table->paginator->total())->toBe(1);
    expect($table->paginator->items()[0]->name)->toBe('John Doe');
});

it('applies column sorting with QueryBuilder', function (): void {
    createUser(['name' => 'Zebra', 'email' => 'zebra@example.com']);
    createUser(['name' => 'Alpha', 'email' => 'alpha@example.com']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: '',
        sorts: new SortCollection([new Sort('name', 'asc')]),
        searches: new SearchCollection,
        filters: new FilterCollection,
    );

    $table = DataTable::query(DB::table('users'))
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ])
        ->handle($request);

    expect($table->paginator->items()[0]->name)->toBe('Alpha');
    expect($table->paginator->items()[1]->name)->toBe('Zebra');
});

it('applies column filtering with QueryBuilder', function (): void {
    createUser(['name' => 'John', 'status' => 'active']);
    createUser(['name' => 'Jane', 'status' => 'inactive']);

    $request = new DataTableRequest(
        page: 1,
        perPage: 25,
        search: '',
        sorts: new SortCollection,
        searches: new SearchCollection,
        filters: new FilterCollection([new Filter('status', 'active')]),
    );

    $table = DataTable::query(DB::table('users'))
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ])
        ->handle($request);

    expect($table->paginator->total())->toBe(1)
        ->and($table->paginator->items()[0]->status)->toBe('active');
});

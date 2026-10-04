<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
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

it('returns deterministic JSON response structure with Eloquent', function (): void {
    createUser(['name' => 'John Doe', 'email' => 'john@example.com']);

    $request = DataTableRequest::fromRequest(Request::create('/test'));

    $result = DataTable::query(User::query())
        ->columns([
            Column::make('name')->label('Name')->searchable()->sortable(),
            Column::make('email')->label('Email')->searchable()->sortable(),
            Column::make('status')->label('Status')->filterable()->sortable(),
            Column::make('created_at')->label('Created At')->sortable(),
        ])
        ->defaultSort('created_at', 'desc')
        ->handle($request);

    $array = $result->toArray();

    // Verify top-level structure
    expect($array)->toHaveKeys(['data', 'meta', 'query', 'columns', 'config']);

    // Verify data structure
    expect($array['data'])->toBeArray();
    expect($array['data'])->toHaveCount(1);
    expect($array['data'][0])->toHaveKeys(['id', 'name', 'email', 'status', 'created_at', 'updated_at']);

    // Verify meta structure
    expect($array['meta'])->toHaveKeys(['current_page', 'per_page', 'from', 'to', 'total', 'last_page']);
    expect($array['meta']['current_page'])->toBe(1);
    expect($array['meta']['per_page'])->toBe(25);
    expect($array['meta']['from'])->toBe(1);
    expect($array['meta']['to'])->toBe(1);
    expect($array['meta']['total'])->toBe(1);
    expect($array['meta']['last_page'])->toBe(1);

    // Verify query structure
    expect($array['query'])->toHaveKeys(['page', 'per_page', 'search', 'sort', 'searches', 'filters']);
    expect($array['query']['page'])->toBe(1);
    expect($array['query']['per_page'])->toBe(25);
    expect($array['query']['search'])->toBe('');
    expect($array['query']['sort'])->toBeArray();
    expect($array['query']['searches'])->toBeArray();
    expect($array['query']['filters'])->toBeArray();

    // Verify columns structure
    expect($array['columns'])->toBeArray();
    expect($array['columns'])->toHaveCount(4);
    foreach ($array['columns'] as $column) {
        expect($column)->toHaveKeys(['name', 'label', 'searchable', 'sortable', 'filterable', 'hidden']);
        expect($column['searchable'])->toBeBool();
        expect($column['sortable'])->toBeBool();
        expect($column['filterable'])->toBeBool();
        expect($column['hidden'])->toBeBool();
    }

    // Verify config structure
    expect($array['config'])->toHaveKeys(['debounce', 'per_page_options']);
    expect($array['config']['debounce'])->toBeInt();
    expect($array['config']['per_page_options'])->toBeArray();
});

it('returns deterministic JSON response structure with QueryBuilder', function (): void {
    DB::table('users')->insert([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'password' => 'password',
        'status' => 'active',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $request = DataTableRequest::fromRequest(Request::create('/test'));

    $result = DataTable::query(DB::table('users'))
        ->columns([
            Column::make('name')->label('Name')->searchable()->sortable(),
            Column::make('email')->label('Email')->searchable()->sortable(),
            Column::make('status')->label('Status')->filterable()->sortable(),
            Column::make('created_at')->label('Created At')->sortable(),
        ])
        ->defaultSort('created_at', 'desc')
        ->handle($request);

    $array = $result->toArray();

    // Verify top-level structure
    expect($array)->toHaveKeys(['data', 'meta', 'query', 'columns', 'config']);

    // Verify data structure
    expect($array['data'])->toBeArray();
    expect($array['data'])->toHaveCount(1);
    expect($array['data'][0])->toHaveKeys(['id', 'name', 'email', 'password', 'status', 'created_at', 'updated_at']);

    // Verify meta structure
    expect($array['meta'])->toHaveKeys(['current_page', 'per_page', 'from', 'to', 'total', 'last_page']);
    expect($array['meta']['current_page'])->toBe(1);
    expect($array['meta']['per_page'])->toBe(25);
    expect($array['meta']['from'])->toBe(1);
    expect($array['meta']['to'])->toBe(1);
    expect($array['meta']['total'])->toBe(1);
    expect($array['meta']['last_page'])->toBe(1);
});

it('includes query state in response', function (): void {
    createUser(['name' => 'John Doe', 'email' => 'john@example.com', 'status' => 'active']);

    $request = DataTableRequest::fromRequest(Request::create('/test?page=2&per_page=10&search=john&sort=-name&searches[email]=example&filters[status]=active'));

    $result = DataTable::query(User::query())
        ->columns([
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ])
        ->handle($request);

    $array = $result->toArray();

    expect($array['query']['page'])->toBe(2);
    expect($array['query']['per_page'])->toBe(10);
    expect($array['query']['search'])->toBe('john');
    expect($array['query']['sort'])->toHaveCount(1);
    expect($array['query']['sort'][0]['column'])->toBe('name');
    expect($array['query']['sort'][0]['direction'])->toBe('desc');
    expect($array['query']['searches'])->toHaveCount(1);
    expect($array['query']['searches'][0]['column'])->toBe('email');
    expect($array['query']['searches'][0]['value'])->toBe('example');
    expect($array['query']['filters'])->toHaveCount(1);
    expect($array['query']['filters'][0]['column'])->toBe('status');
    expect($array['query']['filters'][0]['value'])->toBe('active');
});

it('returns correct columns metadata with capabilities', function (): void {
    createUser(['name' => 'John Doe']);

    $request = DataTableRequest::fromRequest(Request::create('/test'));

    $result = DataTable::query(User::query())
        ->columns([
            Column::make('name')->label('Full Name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
            Column::make('created_at')->sortable()->hidden(),
        ])
        ->handle($request);

    $array = $result->toArray();

    expect($array['columns'])->toHaveCount(4);

    $nameColumn = collect($array['columns'])->firstWhere('name', 'name');
    expect($nameColumn['label'])->toBe('Full Name');
    expect($nameColumn['searchable'])->toBeTrue();
    expect($nameColumn['sortable'])->toBeTrue();
    expect($nameColumn['filterable'])->toBeFalse();
    expect($nameColumn['hidden'])->toBeFalse();

    $emailColumn = collect($array['columns'])->firstWhere('name', 'email');
    expect($emailColumn['label'])->toBe('Email');
    expect($emailColumn['searchable'])->toBeTrue();
    expect($emailColumn['sortable'])->toBeTrue();
    expect($emailColumn['filterable'])->toBeFalse();

    $statusColumn = collect($array['columns'])->firstWhere('name', 'status');
    expect($statusColumn['searchable'])->toBeFalse();
    expect($statusColumn['sortable'])->toBeTrue();
    expect($statusColumn['filterable'])->toBeTrue();

    $createdAtColumn = collect($array['columns'])->firstWhere('name', 'created_at');
    expect($createdAtColumn['searchable'])->toBeFalse();
    expect($createdAtColumn['sortable'])->toBeTrue();
    expect($createdAtColumn['filterable'])->toBeFalse();
    expect($createdAtColumn['hidden'])->toBeTrue();
});

it('returns config with debounce and per_page_options', function (): void {
    createUser(['name' => 'John Doe']);

    $request = DataTableRequest::fromRequest(Request::create('/test'));

    $result = DataTable::query(User::query())
        ->columns([Column::make('name')])
        ->handle($request);

    $array = $result->toArray();

    expect($array['config']['debounce'])->toBe(300);
    expect($array['config']['per_page_options'])->toBe([10, 25, 50, 100]);
});

it('handles empty results with null from/to in meta', function (): void {
    $request = DataTableRequest::fromRequest(Request::create('/test'));

    $result = DataTable::query(User::query())
        ->columns([Column::make('name')->searchable()->sortable()])
        ->handle($request);

    $array = $result->toArray();

    expect($array['meta']['total'])->toBe(0);
    expect($array['meta']['from'])->toBeNull();
    expect($array['meta']['to'])->toBeNull();
    expect($array['meta']['last_page'])->toBe(1);
    expect($array['meta']['current_page'])->toBe(1);
    expect($array['data'])->toBe([]);
});

it('jsonSerialize returns same structure as toArray', function (): void {
    createUser(['name' => 'John Doe']);

    $request = DataTableRequest::fromRequest(Request::create('/test'));

    $result = DataTable::query(User::query())
        ->columns([Column::make('name')->searchable()->sortable()])
        ->handle($request);

    $toArray = $result->toArray();
    $jsonSerialize = $result->jsonSerialize();

    expect($jsonSerialize)->toBe($toArray);
});

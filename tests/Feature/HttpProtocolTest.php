<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
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

function makeTestRoute(string $uri, array $columns, ?string $defaultSortColumn = null, string $defaultSortDirection = 'desc'): void
{
    Route::get($uri, function (Request $request) use ($columns, $defaultSortColumn, $defaultSortDirection) {
        $dataTableRequest = DataTableRequest::fromRequest($request);

        $table = DataTable::query(User::query())
            ->columns($columns);

        if ($defaultSortColumn !== null) {
            $table = $table->defaultSort($defaultSortColumn, $defaultSortDirection);
        }

        $result = $table->handle($dataTableRequest);

        return response()->json($result->toArray());
    })->name('test.'.$uri);
}

function makeQbTestRoute(string $uri, array $columns, ?string $defaultSortColumn = null, string $defaultSortDirection = 'desc'): void
{
    Route::get($uri, function (Request $request) use ($columns, $defaultSortColumn, $defaultSortDirection) {
        $dataTableRequest = DataTableRequest::fromRequest($request);

        $table = DataTable::query(DB::table('users'))
            ->columns($columns);

        if ($defaultSortColumn !== null) {
            $table = $table->defaultSort($defaultSortColumn, $defaultSortDirection);
        }

        $result = $table->handle($dataTableRequest);

        return response()->json($result->toArray());
    })->name('test.'.$uri);
}

it('handles pagination via query parameters', function (): void {
    makeTestRoute('/test-users-pagination', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
        Column::make('status')->filterable()->sortable(),
        Column::make('created_at')->sortable(),
    ], 'created_at', 'desc');

    for ($i = 0; $i < 50; $i++) {
        createUser();
    }

    $response = $this->get('/test-users-pagination?page=2&per_page=10');

    $response->assertOk();
    expect($response->json('data'))->toHaveCount(10);
    expect($response->json('meta.current_page'))->toBe(2);
    expect($response->json('meta.per_page'))->toBe(10);
    expect($response->json('meta.total'))->toBe(50);
});

it('handles global search via query parameter', function (): void {
    makeTestRoute('/test-users-search', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
    ]);

    createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
    createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

    $response = $this->get('/test-users-search?search=john');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(1);
    expect($response->json('data.0.name'))->toBe('John Doe');
});

it('handles column-specific search via searches parameter', function (): void {
    makeTestRoute('/test-users-colsearch', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
    ]);

    createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
    createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);
    createUser(['name' => 'Bob Wilson', 'email' => 'bob@test.com']);

    $response = $this->get('/test-users-colsearch?searches[name]=john');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(1);
    expect($response->json('data.0.name'))->toBe('John Doe');
    expect($response->json('query.searches'))->toBeArray()->toHaveCount(1);
    expect($response->json('query.searches.0.column'))->toBe('name');
    expect($response->json('query.searches.0.value'))->toBe('john');
});

it('handles multiple column searches', function (): void {
    makeTestRoute('/test-users-multicolsearch', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
    ]);

    createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
    createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);
    createUser(['name' => 'John Wilson', 'email' => 'john@test.com']);

    $response = $this->get('/test-users-multicolsearch?searches[name]=john&searches[email]=example');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(1);
    expect($response->json('data.0.name'))->toBe('John Doe');
    expect($response->json('query.searches'))->toHaveCount(2);
});

it('handles sorting via sort parameter', function (): void {
    makeTestRoute('/test-users-sort', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
    ]);

    createUser(['name' => 'Zebra', 'email' => 'zebra@example.com']);
    createUser(['name' => 'Alpha', 'email' => 'alpha@example.com']);

    $response = $this->get('/test-users-sort?sort=name');

    $response->assertOk();
    expect($response->json('data.0.name'))->toBe('Alpha');
    expect($response->json('data.1.name'))->toBe('Zebra');
    expect($response->json('query.sort.0.column'))->toBe('name');
    expect($response->json('query.sort.0.direction'))->toBe('asc');
});

it('handles descending sort via sort parameter', function (): void {
    makeTestRoute('/test-users-sort-desc', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
    ]);

    createUser(['name' => 'Zebra', 'email' => 'zebra@example.com']);
    createUser(['name' => 'Alpha', 'email' => 'alpha@example.com']);

    $response = $this->get('/test-users-sort-desc?sort=-name');

    $response->assertOk();
    expect($response->json('data.0.name'))->toBe('Zebra');
    expect($response->json('data.1.name'))->toBe('Alpha');
    expect($response->json('query.sort.0.direction'))->toBe('desc');
});

it('handles multiple sort columns', function (): void {
    makeTestRoute('/test-users-multisort', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
    ]);

    createUser(['name' => 'Zebra', 'email' => 'a@example.com']);
    createUser(['name' => 'Alpha', 'email' => 'z@example.com']);
    createUser(['name' => 'Alpha', 'email' => 'a2@example.com']);

    $response = $this->get('/test-users-multisort?sort=name,-email');

    $response->assertOk();
    expect($response->json('data.0.name'))->toBe('Alpha');
    expect($response->json('data.0.email'))->toBe('z@example.com');
    expect($response->json('data.1.name'))->toBe('Alpha');
    expect($response->json('data.1.email'))->toBe('a2@example.com');
    expect($response->json('data.2.name'))->toBe('Zebra');
});

it('handles filtering via filters parameter', function (): void {
    makeTestRoute('/test-users-filter', [
        Column::make('name')->searchable()->sortable(),
        Column::make('status')->filterable()->sortable(),
    ]);

    createUser(['name' => 'John', 'status' => 'active']);
    createUser(['name' => 'Jane', 'status' => 'inactive']);

    $response = $this->get('/test-users-filter?filters[status]=active');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(1);
    expect($response->json('data.0.status'))->toBe('active');
    expect($response->json('query.filters.0.column'))->toBe('status');
    expect($response->json('query.filters.0.value'))->toBe('active');
});

it('handles multiple filters', function (): void {
    makeTestRoute('/test-users-multifilter', [
        Column::make('name')->searchable()->sortable(),
        Column::make('status')->filterable()->sortable(),
    ]);

    createUser(['name' => 'John', 'status' => 'active']);
    createUser(['name' => 'Jane', 'status' => 'inactive']);
    createUser(['name' => 'Bob', 'status' => 'active']);

    $response = $this->get('/test-users-multifilter?filters[status]=active');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(2);
});

it('handles combined query parameters', function (): void {
    makeTestRoute('/test-users-combined', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
        Column::make('status')->filterable()->sortable(),
        Column::make('created_at')->sortable(),
    ], 'created_at', 'desc');

    for ($i = 0; $i < 30; $i++) {
        createUser(['status' => $i % 2 === 0 ? 'active' : 'inactive']);
    }
    createUser(['name' => 'John Active', 'status' => 'active', 'email' => 'john@active.com']);
    createUser(['name' => 'John Inactive', 'status' => 'inactive', 'email' => 'john@inactive.com']);

    $response = $this->get('/test-users-combined?page=1&per_page=10&search=john&searches[name]=john&sort=-created_at&filters[status]=active');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(1);
    expect($response->json('data.0.name'))->toBe('John Active');
    expect($response->json('query.page'))->toBe(1);
    expect($response->json('query.per_page'))->toBe(10);
    expect($response->json('query.search'))->toBe('john');
    expect($response->json('query.searches.0.column'))->toBe('name');
    expect($response->json('query.searches.0.value'))->toBe('john');
    expect($response->json('query.sort.0.column'))->toBe('created_at');
    expect($response->json('query.sort.0.direction'))->toBe('desc');
    expect($response->json('query.filters.0.column'))->toBe('status');
    expect($response->json('query.filters.0.value'))->toBe('active');
});

it('rejects sort on non-sortable column', function (): void {
    makeTestRoute('/test-users-reject-sort', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable(), // not sortable
    ]);

    createUser(['name' => 'John']);

    $response = $this->get('/test-users-reject-sort?sort=email');

    $response->assertStatus(500);
});

it('rejects filter on non-filterable column', function (): void {
    makeTestRoute('/test-users-reject-filter', [
        Column::make('name')->searchable()->sortable(), // not filterable
        Column::make('status')->filterable()->sortable(),
    ]);

    createUser(['name' => 'John', 'status' => 'active']);

    $response = $this->get('/test-users-reject-filter?filters[name]=john');

    $response->assertStatus(500);
});

it('rejects column search on non-searchable column', function (): void {
    makeTestRoute('/test-users-reject-colsearch', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->sortable(), // not searchable
    ]);

    createUser(['name' => 'John']);

    $response = $this->get('/test-users-reject-colsearch?searches[email]=john');

    error_log('Response status: '.$response->getStatusCode());
    error_log('Response content: '.$response->getContent());
    $response->assertStatus(500);
});

it('enforces max per page', function (): void {
    makeTestRoute('/test-users-maxpage', [
        Column::make('name')->searchable()->sortable(),
    ]);

    for ($i = 0; $i < 200; $i++) {
        createUser();
    }

    $response = $this->get('/test-users-maxpage?per_page=10000');

    $response->assertOk();
    expect($response->json('meta.per_page'))->toBe(100);
});

it('works with QueryBuilder', function (): void {
    makeQbTestRoute('/test-users-qb', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
        Column::make('status')->filterable()->sortable(),
        Column::make('created_at')->sortable(),
    ], 'created_at', 'desc');

    for ($i = 0; $i < 10; $i++) {
        createUser();
    }

    $response = $this->get('/test-users-qb?search=john');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(0);
});

it('applies column search with QueryBuilder', function (): void {
    makeQbTestRoute('/test-users-qb-colsearch', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
    ]);

    createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
    createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

    $response = $this->get('/test-users-qb-colsearch?searches[name]=john');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(1);
    expect($response->json('data.0.name'))->toBe('John Doe');
});

it('applies column sorting with QueryBuilder', function (): void {
    makeQbTestRoute('/test-users-qb-sort', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
    ]);

    createUser(['name' => 'Zebra', 'email' => 'zebra@example.com']);
    createUser(['name' => 'Alpha', 'email' => 'alpha@example.com']);

    $response = $this->get('/test-users-qb-sort?sort=name');

    $response->assertOk();
    expect($response->json('data.0.name'))->toBe('Alpha');
    expect($response->json('data.1.name'))->toBe('Zebra');
});

it('applies column filtering with QueryBuilder', function (): void {
    makeQbTestRoute('/test-users-qb-filter', [
        Column::make('name')->searchable()->sortable(),
        Column::make('status')->filterable()->sortable(),
    ]);

    createUser(['name' => 'John', 'status' => 'active']);
    createUser(['name' => 'Jane', 'status' => 'inactive']);

    $response = $this->get('/test-users-qb-filter?filters[status]=active');

    $response->assertOk();
    expect($response->json('meta.total'))->toBe(1);
    expect($response->json('data.0.status'))->toBe('active');
});

it('validates default sort direction', function (): void {
    makeTestRoute('/test-users-invalid-default', [
        Column::make('name')->sortable(),
    ], 'name', 'invalid');

    createUser(['name' => 'John']);

    $response = $this->get('/test-users-invalid-default');

    $response->assertStatus(500);
});

it('returns correct query state in response', function (): void {
    makeTestRoute('/test-users-query-state', [
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
        Column::make('status')->filterable()->sortable(),
        Column::make('created_at')->sortable(),
    ], 'created_at', 'desc');

    createUser(['name' => 'John Doe']);

    $response = $this->get('/test-users-query-state?page=3&per_page=15&search=test&sort=-name&searches[email]=example&filters[status]=active');

    $response->assertOk();
    expect($response->json('query.page'))->toBe(3);
    expect($response->json('query.per_page'))->toBe(15);
    expect($response->json('query.search'))->toBe('test');
    expect($response->json('query.sort.0.column'))->toBe('name');
    expect($response->json('query.sort.0.direction'))->toBe('desc');
    expect($response->json('query.searches.0.column'))->toBe('email');
    expect($response->json('query.searches.0.value'))->toBe('example');
    expect($response->json('query.filters.0.column'))->toBe('status');
    expect($response->json('query.filters.0.value'))->toBe('active');
});

it('returns columns metadata with capabilities', function (): void {
    makeTestRoute('/test-users-columns', [
        Column::make('name')->label('Name')->searchable()->sortable(),
        Column::make('email')->label('Email')->searchable()->sortable(),
        Column::make('status')->label('Status')->filterable()->sortable(),
        Column::make('created_at')->label('Created')->sortable(),
    ]);

    $response = $this->get('/test-users-columns');

    $response->assertOk();
    $columns = $response->json('columns');
    expect($columns)->toHaveCount(4);

    $nameColumn = collect($columns)->firstWhere('name', 'name');
    expect($nameColumn['searchable'])->toBeTrue();
    expect($nameColumn['sortable'])->toBeTrue();
    expect($nameColumn['filterable'])->toBeFalse();

    $statusColumn = collect($columns)->firstWhere('name', 'status');
    expect($statusColumn['searchable'])->toBeFalse();
    expect($statusColumn['sortable'])->toBeTrue();
    expect($statusColumn['filterable'])->toBeTrue();
});

<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;

beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->string('password');
        $table->string('status')->default('active');
        $table->string('role')->default('user');
        $table->boolean('is_admin')->default(false);
        $table->timestamps();
        $table->softDeletes();
    });
});

afterEach(function (): void {
    Schema::dropIfExists('users');
});

describe('Users CRUD integration', function (): void {
    it('renders the initial server-side page', function (): void {
        makeTestRoute('/users-crud/initial', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
            Column::make('role')->filterable()->sortable(),
            Column::make('created_at')->sortable(),
        ], 'created_at', 'desc');

        createUser(['name' => 'Ada Lovelace', 'status' => 'active']);
        createUser(['name' => 'Grace Hopper', 'status' => 'active']);
        createUser(['name' => 'Alan Turing', 'status' => 'inactive']);

        $response = $this->get('/users-crud/initial');

        $response->assertOk();
        expect($response->json('data'))->toHaveCount(3);
        expect($response->json('meta.total'))->toBe(3);
        expect($response->json('meta.current_page'))->toBe(1);
        expect($response->json('query.page'))->toBe(1);
        expect($response->json('query.sort'))->toBeArray();
    });

    it('paginates results', function (): void {
        makeTestRoute('/users-crud/pagination', [
            Column::make('name')->searchable()->sortable(),
        ], 'name', 'asc');

        for ($i = 0; $i < 35; $i++) {
            createUser(['name' => 'User '.$i]);
        }

        $response = $this->get('/users-crud/pagination?page=2&per_page=10');

        $response->assertOk();
        expect($response->json('data'))->toHaveCount(10);
        expect($response->json('meta.current_page'))->toBe(2);
        expect($response->json('meta.per_page'))->toBe(10);
        expect($response->json('meta.total'))->toBe(35);
        expect($response->json('meta.last_page'))->toBe(4);
    });

    it('supports global search', function (): void {
        makeTestRoute('/users-crud/global-search', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
        createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

        $response = $this->get('/users-crud/global-search?search=john');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.name'))->toBe('John Doe');
        expect($response->json('query.search'))->toBe('john');
    });

    it('supports per-column search', function (): void {
        makeTestRoute('/users-crud/column-search', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
        ]);

        createUser(['name' => 'John Doe', 'email' => 'john@example.com']);
        createUser(['name' => 'John Wilson', 'email' => 'john@test.com']);
        createUser(['name' => 'Jane Smith', 'email' => 'jane@example.com']);

        $response = $this->get('/users-crud/column-search?searches[name]=john&searches[email]=example');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.name'))->toBe('John Doe');
        expect($response->json('query.searches'))->toHaveCount(2);
    });

    it('supports ascending and descending sorts', function (): void {
        makeTestRoute('/users-crud/sort', [
            Column::make('name')->searchable()->sortable(),
        ], 'name', 'asc');

        createUser(['name' => 'Zara']);
        createUser(['name' => 'Aaron']);
        createUser(['name' => 'Mona']);

        $ascending = $this->get('/users-crud/sort')->assertOk()->json('data');
        expect($ascending[0]['name'])->toBe('Aaron');
        expect($ascending[2]['name'])->toBe('Zara');

        $descending = $this->get('/users-crud/sort?sort=-name')->assertOk()->json('data');
        expect($descending[0]['name'])->toBe('Zara');
        expect($descending[2]['name'])->toBe('Aaron');
    });

    it('supports single-column filters', function (): void {
        makeTestRoute('/users-crud/filter', [
            Column::make('name')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ]);

        createUser(['name' => 'Active One', 'status' => 'active']);
        createUser(['name' => 'Inactive One', 'status' => 'inactive']);

        $response = $this->get('/users-crud/filter?filters[status]=active');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(1);
        expect($response->json('data.0.name'))->toBe('Active One');
        expect($response->json('query.filters.0.column'))->toBe('status');
        expect($response->json('query.filters.0.value'))->toBe('active');
    });

    it('supports array (multi-value) filters', function (): void {
        makeTestRoute('/users-crud/array-filter', [
            Column::make('name')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
        ]);

        createUser(['name' => 'Active One', 'status' => 'active']);
        createUser(['name' => 'Active Two', 'status' => 'active']);
        createUser(['name' => 'Inactive One', 'status' => 'inactive']);
        createUser(['name' => 'Draft One', 'status' => 'draft']);

        $response = $this->get('/users-crud/array-filter?filters[status][]=active&filters[status][]=inactive');

        $response->assertOk();
        expect($response->json('meta.total'))->toBe(3);
        $statuses = collect($response->json('data'))->pluck('status')->sort()->values()->all();
        expect($statuses)->toBe(['active', 'active', 'inactive']);
        expect($response->json('query.filters'))->toHaveCount(1);
        expect($response->json('query.filters.0.value'))->toBeArray()->toHaveCount(2);
    });

    it('keeps hidden columns in the response payload', function (): void {
        makeTestRoute('/users-crud/hidden', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->hidden(),
        ]);

        createUser(['name' => 'Ada', 'email' => 'ada@example.com']);

        $response = $this->get('/users-crud/hidden');

        $response->assertOk();
        expect($response->json('data.0.name'))->toBe('Ada');
        expect($response->json('data.0.email'))->toBe('ada@example.com');
    });

    it('returns empty results when nothing matches', function (): void {
        makeTestRoute('/users-crud/empty', [
            Column::make('name')->searchable()->sortable(),
        ]);

        createUser(['name' => 'Ada']);

        $response = $this->get('/users-crud/empty?search=zzz-no-match');

        $response->assertOk();
        expect($response->json('data'))->toEqual([]);
        expect($response->json('meta.total'))->toBe(0);
        expect($response->json('meta.last_page'))->toBe(1);
    });

    it('echoes the effective table state in the query object', function (): void {
        makeTestRoute('/users-crud/query-state', [
            Column::make('name')->searchable()->sortable(),
            Column::make('email')->searchable()->sortable(),
            Column::make('status')->filterable()->sortable(),
            Column::make('created_at')->sortable(),
        ], 'created_at', 'desc');

        createUser(['name' => 'Ada']);

        $response = $this->get('/users-crud/query-state?page=3&per_page=15&search=ada&sort=name&filters[status]=active&searches[name]=ada');

        $response->assertOk();
        expect($response->json('query.page'))->toBe(3);
        expect($response->json('query.per_page'))->toBe(15);
        expect($response->json('query.search'))->toBe('ada');
        expect($response->json('query.sort'))->toBeArray()->toHaveCount(1);
        expect($response->json('query.filters'))->toBeArray()->toHaveCount(1);
        expect($response->json('query.searches'))->toBeArray()->toHaveCount(1);
    });

    it('rejects an unknown sort column with 422', function (): void {
        makeTestRoute('/users-crud/invalid-sort', [
            Column::make('name')->searchable()->sortable(),
        ]);

        $response = $this->get('/users-crud/invalid-sort?sort=password');

        $response->assertStatus(422);
        expect($response->json('message'))->toBeString();
        expect($response->json('errors.query'))->toBeArray();
    });

    it('rejects an unknown filter column with 422', function (): void {
        makeTestRoute('/users-crud/invalid-filter', [
            Column::make('name')->searchable()->sortable(),
        ]);

        $response = $this->get('/users-crud/invalid-filter?filters[password]=secret');

        $response->assertStatus(422);
        expect($response->json('errors.query'))->toBeArray();
    });
});

<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Processing\Projection;
use TooInfinity\InertiaDataTables\Processing\StableOrdering;
use TooInfinity\InertiaDataTables\Processing\TableColumns;
use Workbench\App\Models\User;

beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->string('password');
        $table->timestamps();
    });
});

afterEach(function (): void {
    Schema::dropIfExists('users');
});

describe('StableOrdering', function (): void {
    $projection = new Projection;
    $stableOrdering = new StableOrdering($projection, new TableColumns);

    it('appends primary key tiebreaker to unordered Eloquent queries', function () use ($stableOrdering): void {
        $query = User::query();

        $stableOrdering->apply($query);

        $orders = $query->getQuery()->orders ?? [];
        expect($orders)->toHaveCount(1);
        expect($orders[0]['column'])->toBe('users.id');
        expect($orders[0]['direction'])->toBe('asc');
    });

    it('appends primary key tiebreaker to ordered Eloquent queries without duplicating', function () use ($stableOrdering): void {
        $query = User::query()->orderBy('name', 'desc');

        $stableOrdering->apply($query);

        $orders = $query->getQuery()->orders ?? [];
        expect($orders)->toHaveCount(2);
        expect($orders[0]['column'])->toBe('name');
        expect($orders[1]['column'])->toBe('users.id');
    });

    it('does not append tiebreaker if query is already ordered by primary key', function () use ($stableOrdering): void {
        $query = User::query()->orderBy('users.id', 'desc');

        $stableOrdering->apply($query);

        $orders = $query->getQuery()->orders ?? [];
        expect($orders)->toHaveCount(1);
        expect($orders[0]['column'])->toBe('users.id');
        expect($orders[0]['direction'])->toBe('desc');
    });

    it('appends id tiebreaker to plain QueryBuilder queries', function () use ($stableOrdering): void {
        $query = DB::table('users');

        $stableOrdering->apply($query);

        $orders = $query->orders ?? [];
        expect($orders)->toHaveCount(1);
        expect($orders[0]['column'])->toBe('id');
        expect($orders[0]['direction'])->toBe('asc');
    });

    it('does not append tiebreaker to queries with having clauses', function () use ($stableOrdering): void {
        $query = DB::table('users')->having('id', '>', 0);

        $stableOrdering->apply($query);

        expect($query->orders ?? [])->toBeEmpty();
    });

    it('orders grouped queries by their grouping columns', function () use ($stableOrdering): void {
        $query = DB::table('users')->groupBy('name');

        $stableOrdering->apply($query);

        $orders = $query->orders ?? [];
        expect($orders)->toHaveCount(1);
        expect($orders[0]['column'])->toBe('name');
        expect($orders[0]['direction'])->toBe('asc');
    });

    it('checks isOrderedBy accurately', function () use ($stableOrdering): void {
        $query = DB::table('users')->orderBy('users.id', 'asc');

        expect($stableOrdering->isOrderedBy($query, 'id', 'users.id'))->toBeTrue();
        expect($stableOrdering->isOrderedBy($query, 'name'))->toBeFalse();
    });
});

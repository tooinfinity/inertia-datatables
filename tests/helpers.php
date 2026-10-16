<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
use Workbench\App\Models\User;

function createUser(array $attributes = []): User
{
    static $password;

    return User::create(array_merge([
        'name' => fake()->name(),
        'email' => fake()->unique()->safeEmail(),
        'status' => 'active',
        'password' => $password ??= '$2y$04$wT3wY2K7dKjMh6H7R9uIhe9Zz3E3O6B2I5l9h.8P7v4n3S3T4k6W2',
    ], $attributes));
}

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

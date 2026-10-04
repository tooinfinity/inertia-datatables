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
    return User::create(array_merge([
        'name' => fake()->name(),
        'email' => fake()->unique()->safeEmail(),
        'status' => 'active',
        'password' => 'password',
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

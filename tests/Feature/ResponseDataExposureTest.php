<?php

declare(strict_types=1);

use Illuminate\Http\Request;
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

it('restricts Eloquent response data to declared columns', function (): void {
    createUser([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'secret' => 'private-token',
    ]);

    $result = DataTable::query(User::query())
        ->columns([Column::make('name')])
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toBe(['name' => 'John Doe']);
});

it('restricts Query Builder response data to declared columns', function (): void {
    DB::table('users')->insert([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'password' => 'password',
        'secret' => 'private-token',
    ]);

    $result = DataTable::query(DB::table('users'))
        ->columns([Column::make('name')])
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toBe(['name' => 'John Doe']);
});

it('can explicitly expose all response attributes', function (): void {
    createUser([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'secret' => 'private-token',
    ]);

    $result = DataTable::query(User::query())
        ->columns([Column::make('name')])
        ->exposeAll()
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys([
        'id',
        'name',
        'email',
        'status',
        'role',
        'is_admin',
        'secret',
        'created_at',
        'updated_at',
    ]);
});

it('includes declared hidden columns in response data', function (): void {
    createUser([
        'name' => 'John Doe',
        'secret' => 'private-token',
    ]);

    $result = DataTable::query(User::query())
        ->columns([
            Column::make('name'),
            Column::make('secret')->hidden(),
        ])
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toBe([
        'name' => 'John Doe',
        'secret' => 'private-token',
    ]);
});

it('can expose a configured response key without exposing other undeclared attributes', function (): void {
    createUser([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'secret' => 'private-token',
    ]);

    $result = DataTable::query(User::query())
        ->columns([Column::make('name')])
        ->responseKey('id')
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['id', 'name'])
        ->and($row)->toHaveCount(2);
});

<?php

declare(strict_types=1);

use Illuminate\Database\Eloquent\Model as BaseModel;
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

it('includes multiple chained response keys without exposing other undeclared attributes', function (): void {
    createUser([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'secret' => 'private-token',
        'status' => 'active',
    ]);

    $result = DataTable::query(User::query())
        ->columns([Column::make('name')])
        ->responseKey('id')
        ->responseKey('status')
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['id', 'status', 'name'])
        ->and($row)->toHaveCount(3)
        ->and($row)->not->toHaveKey('secret');
});

it('includes multiple response keys via responseKeys() without exposing other undeclared attributes', function (): void {
    createUser([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'secret' => 'private-token',
        'status' => 'active',
    ]);

    $result = DataTable::query(User::query())
        ->columns([Column::make('name')])
        ->responseKeys(['id', 'status'])
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['id', 'status', 'name'])
        ->and($row)->toHaveCount(3)
        ->and($row)->not->toHaveKey('secret');
});

it('includes multiple chained response keys for Query Builder without exposing other undeclared attributes', function (): void {
    DB::table('users')->insert([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'password' => 'password',
        'secret' => 'private-token',
        'status' => 'active',
    ]);

    $result = DataTable::query(DB::table('users'))
        ->columns([Column::make('name')])
        ->responseKey('id')
        ->responseKey('status')
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['id', 'status', 'name'])
        ->and($row)->toHaveCount(3)
        ->and($row)->not->toHaveKey('secret');
});

it('selects configured response keys for Eloquent when the query explicitly selects columns', function (): void {
    createUser([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'secret' => 'private-token',
        'status' => 'active',
    ]);

    $result = DataTable::query(User::query()->select(['name']))
        ->columns([Column::make('name')])
        ->responseKeys(['id', 'status'])
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['id', 'status', 'name'])
        ->and($row)->toHaveCount(3)
        ->and($row)->not->toHaveKey('secret')
        ->and($row)->not->toHaveKey('email');
});

it('selects configured response keys for Query Builder when the query explicitly selects columns', function (): void {
    DB::table('users')->insert([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'password' => 'password',
        'secret' => 'private-token',
        'status' => 'active',
    ]);

    $result = DataTable::query(DB::table('users')->select(['name']))
        ->columns([Column::make('name')])
        ->responseKeys(['id', 'status'])
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['id', 'status', 'name'])
        ->and($row)->toHaveCount(3)
        ->and($row)->not->toHaveKey('secret')
        ->and($row)->not->toHaveKey('email');
});

it('preserves explicitly selected declared columns alongside response keys', function (): void {
    createUser([
        'name' => 'John Doe',
        'email' => 'john@example.com',
        'secret' => 'private-token',
        'status' => 'active',
    ]);

    $result = DataTable::query(User::query()->select(['name', 'email']))
        ->columns([Column::make('name'), Column::make('email')])
        ->responseKeys(['id'])
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['id', 'name', 'email'])
        ->and($row)->toHaveCount(3)
        ->and($row)->not->toHaveKey('secret');
});

it('does not break when an Eloquent accessor is used as a response key', function (): void {
    createUser([
        'name' => 'John Doe',
        'status' => 'active',
    ]);

    // `can_update` is a computed accessor, not a database column. It must not
    // be added to the SQL SELECT list, so no unknown-column error occurs.
    $result = DataTable::query(User::query())
        ->columns([Column::make('name')])
        ->responseKey('can_update')
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['name', 'can_update'])
        ->and($row)->toHaveCount(2)
        ->and($row['can_update'])->toBeTrue()
        ->and($row)->not->toHaveKey('secret');
});

it('does not break when an Eloquent accessor is used as a response key with an explicit selection', function (): void {
    createUser([
        'name' => 'John Doe',
        'status' => 'active',
    ]);

    // `status` is not selected, so the accessor evaluates against a null
    // source attribute and returns false. The important thing is that no
    // unknown-column SQL error occurs and strict projection is preserved.
    $result = DataTable::query(User::query()->select(['name']))
        ->columns([Column::make('name')])
        ->responseKey('can_update')
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['name', 'can_update'])
        ->and($row)->toHaveCount(2)
        ->and($row['can_update'])->toBeFalse()
        ->and($row)->not->toHaveKey('status')
        ->and($row)->not->toHaveKey('secret');
});

it('includes an appended Eloquent attribute as a response key without selecting it in SQL', function (): void {
    createUser([
        'name' => 'John Doe',
        'status' => 'active',
    ]);

    // A model that appends the computed `can_update` attribute. The attribute
    // is not a database column, so it must not be added to the SQL SELECT.
    $model = new class extends BaseModel
    {
        protected $table = 'users';

        protected $appends = ['can_update'];

        public function getCanUpdateAttribute(): bool
        {
            return $this->status === 'active';
        }
    };

    $result = DataTable::query($model::query()->select(['name', 'status']))
        ->columns([Column::make('name'), Column::make('status')])
        ->responseKey('can_update')
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['name', 'status', 'can_update'])
        ->and($row)->toHaveCount(3)
        ->and($row['can_update'])->toBeTrue()
        ->and($row)->not->toHaveKey('secret');
});

it('only serializes declared appended attributes and supports modern Eloquent accessors', function (): void {
    createUser([
        'name' => 'John Doe',
        'status' => 'active',
        'secret' => 'private-token',
    ]);

    $model = new class extends BaseModel
    {
        protected $table = 'users';

        protected $appends = ['internal_metadata'];

        protected function canUpdate(): \\Illuminate\\Database\\Eloquent\\Casts\\Attribute
        {
            return \\Illuminate\\Database\\Eloquent\\Casts\\Attribute::get(
                fn (): bool => $this->status === 'active',
            );
        }

        protected function internalMetadata(): \\Illuminate\\Database\\Eloquent\\Casts\\Attribute
        {
            return \\Illuminate\\Database\\Eloquent\\Casts\\Attribute::get(
                fn (): string => 'must-not-leak',
            );
        }
    };

    $result = DataTable::query($model::query())
        ->columns([Column::make('name')])
        ->responseKey('can_update')
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['name', 'can_update'])
        ->and($row)->toHaveCount(2)
        ->and($row['can_update'])->toBeTrue()
        ->and($row)->not->toHaveKey('internal_metadata')
        ->and($row)->not->toHaveKey('status')
        ->and($row)->not->toHaveKey('secret');
});

it('preserves computed accessor value when its source attribute is not projected', function (): void {
    createUser([
        'name' => 'John Doe',
        'status' => 'active',
        'secret' => 'private-token',
    ]);

    // `status` is neither a declared column nor a response key, so it is
    // stripped from the raw attributes. `can_update` depends on `status`, so
    // its value must be computed before projection and preserved.
    $result = DataTable::query(User::query())
        ->columns([Column::make('name')])
        ->responseKey('can_update')
        ->handle(DataTableRequest::fromRequest(Request::create('/test')));

    $row = json_decode(json_encode($result), true)['data'][0];

    expect($row)->toHaveKeys(['name', 'can_update'])
        ->and($row)->toHaveCount(2)
        ->and($row['can_update'])->toBeTrue()
        ->and($row)->not->toHaveKey('status')
        ->and($row)->not->toHaveKey('secret');
});

<?php

declare(strict_types=1);

/*
 * Server-side DataTable benchmark, run through `codspeed run` (see codspeed.yml).
 *
 * Usage: php benchmarks/php/datatable.php <scenario>
 *
 * Every run boots a Testbench application on an in-memory SQLite database,
 * seeds it, then handles the scenario's request ITERATIONS times. Boot and
 * seeding are a constant part of every scenario.
 */

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Orchestra\Testbench\Foundation\Application;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\InertiaDataTablesServiceProvider;
use Workbench\App\Models\Post;
use Workbench\App\Models\User;

require __DIR__.'/../../vendor/autoload.php';

const USERS = 1000;
const POSTS_PER_USER = 3;
const ITERATIONS = 50;

$scenarios = [
    'users-default' => [
        'query' => [],
        'table' => static fn (): DataTable => DataTable::query(User::query())
            ->columns(userColumns())
            ->defaultSort('id'),
    ],
    'users-search-sort-filter' => [
        'query' => [
            'search' => 'user 1',
            'sort' => '-status,name',
            'filters' => ['role' => ['admin', 'editor'], 'is_admin' => '0'],
            'searches' => ['email' => 'example'],
            'per_page' => '100',
        ],
        'table' => static fn (): DataTable => DataTable::query(User::query())
            ->columns(userColumns())
            ->defaultSort('id'),
    ],
    'posts-relation' => [
        'query' => [
            'search' => 'user 2',
            'sort' => 'author_name,-id',
            'filters' => ['status' => 'published'],
            'per_page' => '50',
        ],
        'table' => static fn (): DataTable => DataTable::query(Post::query())
            ->columns([
                Column::make('id')->sortable(),
                Column::make('title')->searchable()->sortable(),
                Column::make('status')->filterable()->filterOptions([
                    ['value' => 'draft', 'label' => 'Draft'],
                    ['value' => 'published', 'label' => 'Published'],
                ]),
                Column::make('author_name')->relation('user', 'name')->searchable()->sortable(),
                Column::make('excerpt')->field('body')->value(
                    static fn (Post $post): string => mb_strimwidth((string) $post->body, 0, 40, '...'),
                ),
                Column::make('published_at')->sortable(),
            ]),
    ],
];

/**
 * @return array<int, Column>
 */
function userColumns(): array
{
    return [
        Column::make('id')->sortable(),
        Column::make('name')->searchable()->sortable(),
        Column::make('email')->searchable()->sortable(),
        Column::make('status')->filterable()->sortable()->filterOptions([
            ['value' => 'active', 'label' => 'Active'],
            ['value' => 'inactive', 'label' => 'Inactive'],
        ]),
        Column::make('role')->filterable()->filterOptions([
            ['value' => 'admin', 'label' => 'Admin'],
            ['value' => 'editor', 'label' => 'Editor'],
            ['value' => 'user', 'label' => 'User'],
        ]),
        Column::make('is_admin')->filterable()->filterType('boolean'),
        Column::make('created_at')->sortable(),
    ];
}

$scenarioName = $argv[1] ?? '';

if (! isset($scenarios[$scenarioName])) {
    fwrite(STDERR, 'Usage: php benchmarks/php/datatable.php <'.implode('|', array_keys($scenarios)).">\n");

    exit(1);
}

$app = Application::create(
    options: ['extra' => ['providers' => [InertiaDataTablesServiceProvider::class]]],
);

$app['config']->set('database.default', 'sqlite');
$app['config']->set('database.connections.sqlite', [
    'driver' => 'sqlite',
    'database' => ':memory:',
    'prefix' => '',
    'foreign_key_constraints' => true,
]);

Schema::create('users', function (Blueprint $table): void {
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

Schema::create('posts', function (Blueprint $table): void {
    $table->id();
    $table->foreignId('user_id')->constrained()->cascadeOnDelete();
    $table->string('title');
    $table->text('body');
    $table->string('status')->default('draft');
    $table->timestamp('published_at')->nullable();
    $table->timestamps();
    $table->softDeletes();
});

$now = '2026-01-01 00:00:00';
$roles = ['admin', 'editor', 'user'];
$users = [];
$posts = [];

for ($i = 1; $i <= USERS; $i++) {
    $users[] = [
        'name' => "User {$i}",
        'email' => "user{$i}@example.com",
        'password' => 'secret',
        'status' => $i % 3 === 0 ? 'inactive' : 'active',
        'role' => $roles[$i % 3],
        'is_admin' => $i % 10 === 0,
        'created_at' => $now,
        'updated_at' => $now,
    ];

    for ($j = 1; $j <= POSTS_PER_USER; $j++) {
        $posts[] = [
            'user_id' => $i,
            'title' => "Post {$j} by user {$i}",
            'body' => str_repeat("Body of post {$j} written by user {$i}. ", 4),
            'status' => ($i + $j) % 2 === 0 ? 'published' : 'draft',
            'published_at' => ($i + $j) % 2 === 0 ? $now : null,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }
}

DB::transaction(static function () use ($users, $posts): void {
    foreach (array_chunk($users, 100) as $chunk) {
        DB::table('users')->insert($chunk);
    }

    foreach (array_chunk($posts, 100) as $chunk) {
        DB::table('posts')->insert($chunk);
    }
});

$scenario = $scenarios[$scenarioName];
$rows = 0;

for ($i = 0; $i < ITERATIONS; $i++) {
    $request = DataTableRequest::fromRequest(Request::create('/', 'GET', $scenario['query']));
    $result = $scenario['table']()->handle($request);
    json_encode($result, JSON_THROW_ON_ERROR);
    $rows += $result->paginator->count();
}

if ($rows === 0) {
    fwrite(STDERR, "Scenario {$scenarioName} returned no rows.\n");

    exit(1);
}

$app->flush();

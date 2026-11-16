<?php

declare(strict_types=1);

use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTable;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\Sort;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;
use TooInfinity\InertiaDataTables\Tests\Fixtures\StablePaginationUser;
use Workbench\App\Models\User;
use Workbench\Database\Factories\UserFactory;

beforeEach(function (): void {
    Schema::create('users', function ($table): void {
        $table->id();
        $table->string('name');
        $table->string('email')->unique();
        $table->timestamp('email_verified_at')->nullable();
        $table->string('password');
        $table->rememberToken();
        $table->string('status')->default('active');
        $table->timestamps();
        $table->softDeletes();
    });

    Schema::create('accounts', function ($table): void {
        $table->id();
        $table->unsignedBigInteger('user_id');
        $table->string('label');
    });
});

afterEach(function (): void {
    Schema::dropIfExists('users');
    Schema::dropIfExists('accounts');
    Schema::dropIfExists('sessions');
});

/**
 * Capture the paginated queries that contain an ordering.
 *
 * Schema lookups also contain an ordering, so only queries with a limit are
 * captured.
 *
 * @return ArrayObject<int, string>
 */
function captureOrderedQueries(): ArrayObject
{
    $queries = new ArrayObject;

    DB::listen(function (QueryExecuted $query) use ($queries): void {
        $sql = strtolower($query->sql);

        if (str_contains($sql, 'order by') && str_contains($sql, 'limit')) {
            $queries[] = $query->sql;
        }
    });

    return $queries;
}

/**
 * @return ArrayObject<int, string>
 */
function captureQueries(): ArrayObject
{
    $queries = new ArrayObject;

    DB::listen(function (QueryExecuted $query) use ($queries): void {
        $queries[] = $query->sql;
    });

    return $queries;
}

function stablePaginationRequest(int $page, int $perPage, ?SortCollection $sorts = null): DataTableRequest
{
    return new DataTableRequest(
        page: $page,
        perPage: $perPage,
        search: '',
        sorts: $sorts ?? new SortCollection,
        searches: new SearchCollection,
        filters: new FilterCollection,
    );
}

function normalizedSql(string $sql): string
{
    return strtolower(str_replace(['`', '"'], '', $sql));
}

describe('Stable pagination', function (): void {
    it('paginates tied Eloquent rows exactly once with a primary-key tiebreaker', function (): void {
        UserFactory::new()->count(20)->create();

        $expectedIds = User::query()->orderBy('id')->pluck('id')->all();
        $queries = captureOrderedQueries();
        $sorts = new SortCollection([Sort::make('status', 'asc')]);
        $seenIds = [];

        for ($page = 1; $page <= 4; $page++) {
            $result = DataTable::query(User::query())
                ->columns([
                    Column::make('id'),
                    Column::make('status')->sortable(),
                ])
                ->handle(stablePaginationRequest($page, 5, $sorts));

            $seenIds = array_merge(
                $seenIds,
                array_map(fn (User $user): int => $user->id, $result->paginator->items()),
            );
        }

        expect($seenIds)->toHaveCount(20)
            ->and(array_unique($seenIds))->toHaveCount(20)
            ->and($seenIds)->toEqualCanonicalizing($expectedIds)
            ->and($queries)->not->toBeEmpty();

        foreach ($queries as $sql) {
            expect(normalizedSql($sql))->toMatch('/users\.id asc limit \d+(?: offset \d+)?$/');
        }
    });

    it('paginates tied Query Builder rows exactly once with an id tiebreaker', function (): void {
        UserFactory::new()->count(20)->create();

        $expectedIds = DB::table('users')->orderBy('id')->pluck('id')->all();
        $queries = captureOrderedQueries();
        $sorts = new SortCollection([Sort::make('status', 'asc')]);
        $seenIds = [];

        for ($page = 1; $page <= 4; $page++) {
            $result = DataTable::query(DB::table('users'))
                ->columns([
                    Column::make('id'),
                    Column::make('status')->sortable(),
                ])
                ->handle(stablePaginationRequest($page, 5, $sorts));

            $seenIds = array_merge(
                $seenIds,
                array_map(fn (object $user): int => (int) $user->id, $result->paginator->items()),
            );
        }

        expect($seenIds)->toHaveCount(20)
            ->and(array_unique($seenIds))->toHaveCount(20)
            ->and($seenIds)->toEqualCanonicalizing($expectedIds)
            ->and($queries)->not->toBeEmpty();

        foreach ($queries as $sql) {
            expect(normalizedSql($sql))->toMatch('/(?:^|[^a-z0-9_])id asc limit \d+(?: offset \d+)?$/');
        }
    });

    it('adds a tiebreaker when no sort is requested', function (): void {
        UserFactory::new()->create();

        $queries = captureOrderedQueries();

        DataTable::query(User::query())
            ->columns([Column::make('id'), Column::make('status')->sortable()])
            ->handle(stablePaginationRequest(1, 25));

        DataTable::query(DB::table('users'))
            ->columns([Column::make('id'), Column::make('status')->sortable()])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(2);

        expect(normalizedSql($queries[0]))->toMatch('/users\.id asc limit \d+(?: offset \d+)?$/');
        expect(normalizedSql($queries[1]))->toMatch('/(?:^|[^a-z0-9_])id asc limit \d+(?: offset \d+)?$/');
    });

    it('does not duplicate a tiebreaker already present in the sort', function (): void {
        UserFactory::new()->create();

        $queries = captureOrderedQueries();
        $sorts = new SortCollection([Sort::make('id', 'asc')]);

        DataTable::query(User::query())
            ->columns([Column::make('id')->sortable()])
            ->handle(stablePaginationRequest(1, 25, $sorts));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by (?:[a-z0-9_]+\.)?id asc limit \d+(?: offset \d+)?$/');
    });

    it('uses the actual qualified key of an Eloquent model', function (): void {
        UserFactory::new()->create();

        $queries = captureOrderedQueries();

        DataTable::query(StablePaginationUser::query())
            ->columns([Column::make('email'), Column::make('status')])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/users\.email asc limit \d+(?: offset \d+)?$/');
    });

    it('uses the builder alias when qualifying an Eloquent key', function (): void {
        UserFactory::new()->create();

        $queries = captureOrderedQueries();

        DataTable::query(StablePaginationUser::query()->from('users as u'))
            ->columns([Column::make('email'), Column::make('status')])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/u\.email asc limit \d+(?: offset \d+)?$/');
    });

    it('uses a selected key for a distinct Eloquent projection', function (): void {
        UserFactory::new()->create();

        $queries = captureOrderedQueries();

        DataTable::query(User::query()->select('id', 'name')->distinct())
            ->columns([Column::make('id'), Column::make('name')])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by id asc limit \d+(?: offset \d+)?$/');
    });

    it('does not add a key to distinct projections that omit it', function (): void {
        UserFactory::new()->count(3)->create(['name' => 'Same name']);

        $queries = captureQueries();

        $eloquentResult = DataTable::query(User::query()->select('name')->distinct())
            ->columns([Column::make('name')])
            ->handle(stablePaginationRequest(1, 25));

        $queryBuilderResult = DataTable::query(DB::table('users')->select('name')->distinct())
            ->columns([Column::make('name')])
            ->handle(stablePaginationRequest(1, 25));

        expect($eloquentResult->paginator->items())->toHaveCount(1)
            ->and($queryBuilderResult->paginator->items())->toHaveCount(1);

        foreach ($queries as $sql) {
            expect(strtolower($sql))->not->toContain('order by');
        }
    });

    it('does not add a row key to aggregate-only projections', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureQueries();

        $eloquentResult = DataTable::query(
            User::query()
                ->selectRaw('count(*) as total')
                ->havingRaw('count(*) > 0'),
        )
            ->columns([Column::make('total')])
            ->handle(stablePaginationRequest(1, 25));

        $queryBuilderResult = DataTable::query(DB::table('users')->selectRaw('count(*) as total'))
            ->columns([Column::make('total')])
            ->handle(stablePaginationRequest(1, 25));

        expect((int) $eloquentResult->paginator->first()->total)->toBe(3)
            ->and((int) $queryBuilderResult->paginator->first()->total)->toBe(3);

        foreach ($queries as $sql) {
            expect(strtolower($sql))->not->toContain('order by');
        }
    });

    it('does not reuse raw group expressions as ordering terms', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureQueries();

        $eloquentResult = DataTable::query(
            User::query()
                ->selectRaw('count(*) as total')
                ->groupByRaw('status = ?', ['active']),
        )
            ->columns([Column::make('total')])
            ->handle(stablePaginationRequest(1, 25));

        $queryBuilderResult = DataTable::query(
            DB::table('users')
                ->selectRaw('count(*) as total')
                ->groupByRaw('status = ?', ['active']),
        )
            ->columns([Column::make('total')])
            ->handle(stablePaginationRequest(1, 25));

        expect((int) $eloquentResult->paginator->first()->total)->toBe(3)
            ->and((int) $queryBuilderResult->paginator->first()->total)->toBe(3);

        foreach ($queries as $sql) {
            expect(strtolower($sql))->not->toContain('order by');
        }
    });

    it('orders plain grouped queries by their grouping columns', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureOrderedQueries();

        DataTable::query(
            User::query()
                ->selectRaw('status, count(*) as total')
                ->groupBy('status'),
        )
            ->columns([Column::make('status'), Column::make('total')])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by status asc limit \d+(?: offset \d+)?$/');
    });

    it('orders union queries by the projected row key without a table qualifier', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureOrderedQueries();

        $activeUsers = StablePaginationUser::query()->where('status', 'active');
        $inactiveUsers = StablePaginationUser::query()->where('status', 'inactive');

        $result = DataTable::query($activeUsers->union($inactiveUsers))
            ->columns([Column::make('email'), Column::make('status')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->total())->toBe(3)
            ->and($queries)->not->toBeEmpty();

        foreach ($queries as $sql) {
            expect(normalizedSql($sql))->toMatch('/order by email asc limit \d+(?: offset \d+)?$/')
                ->and(normalizedSql($sql))->not->toMatch('/order by [a-z0-9_]+\.email asc/');
        }
    });

    it('orders query builder unions by the projected row key', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureOrderedQueries();

        $activeUsers = DB::table('users')->where('status', 'active');
        $inactiveUsers = DB::table('users')->where('status', 'inactive');

        $result = DataTable::query($activeUsers->union($inactiveUsers))
            ->columns([Column::make('id'), Column::make('status')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->total())->toBe(3)
            ->and($queries)->not->toBeEmpty();

        foreach ($queries as $sql) {
            expect(normalizedSql($sql))->toMatch('/order by id asc limit \d+(?: offset \d+)?$/');
        }
    });

    it('does not add a key to unions that do not project it', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureQueries();

        $activeUsers = DB::table('users')->select('name')->where('status', 'active');
        $inactiveUsers = DB::table('users')->select('name')->where('status', 'inactive');

        $result = DataTable::query($activeUsers->union($inactiveUsers))
            ->columns([Column::make('name')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->items())->toHaveCount(3);

        foreach ($queries as $sql) {
            expect(strtolower($sql))->not->toContain('order by');
        }
    });

    it('adds a tiebreaker to raw row projections', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureOrderedQueries();

        DataTable::query(User::query()->selectRaw('id, name'))
            ->columns([Column::make('id'), Column::make('name')])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by [a-z0-9_]+\.id asc limit \d+(?: offset \d+)?$/');
    });

    it('orders distinct raw projections by their projected key alias', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureOrderedQueries();

        DataTable::query(User::query()->selectRaw('id as row_id, name')->distinct())
            ->columns([Column::make('row_id'), Column::make('name')])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by row_id asc limit \d+(?: offset \d+)?$/');
    });

    it('orders distinct projections of the base table by its key', function (): void {
        UserFactory::new()->count(2)->create();

        $userIds = DB::table('users')->orderBy('id')->pluck('id')->all();

        DB::table('accounts')->insert([
            ['user_id' => $userIds[0], 'label' => 'First'],
            ['user_id' => $userIds[1], 'label' => 'Second'],
        ]);

        $queries = captureOrderedQueries();

        $result = DataTable::query(
            User::query()
                ->join('accounts', 'users.id', '=', 'accounts.user_id')
                ->select('users.*')
                ->distinct(),
        )
            ->columns([Column::make('id'), Column::make('name')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->items())->toHaveCount(2)
            ->and($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by [a-z0-9_]+\.id asc limit \d+(?: offset \d+)?$/');
    });

    it('does not add a key to distinct projections of a joined table', function (): void {
        UserFactory::new()->count(2)->create();

        $userIds = DB::table('users')->orderBy('id')->pluck('id')->all();

        DB::table('accounts')->insert([
            ['user_id' => $userIds[0], 'label' => 'First'],
            ['user_id' => $userIds[1], 'label' => 'Second'],
        ]);

        $queries = captureQueries();

        $result = DataTable::query(
            User::query()
                ->join('accounts', 'users.id', '=', 'accounts.user_id')
                ->select('accounts.*')
                ->distinct(),
        )
            ->columns([Column::make('id'), Column::make('label')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->items())->toHaveCount(2);

        foreach ($queries as $sql) {
            expect(strtolower($sql))->not->toContain('order by');
        }
    });

    it('orders plain grouped distinct queries by their grouping columns', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureOrderedQueries();

        DataTable::query(
            User::query()
                ->selectRaw('status, count(*) as total')
                ->groupBy('status')
                ->distinct(),
        )
            ->columns([Column::make('status'), Column::make('total')])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by status asc limit \d+(?: offset \d+)?$/');
    });

    it('orders grouped distinct queries by the projected alias of the grouping column', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureOrderedQueries();

        DataTable::query(
            User::query()
                ->selectRaw('status as state, count(*) as total')
                ->groupBy('status')
                ->distinct(),
        )
            ->columns([Column::make('state'), Column::make('total')])
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by state asc limit \d+(?: offset \d+)?$/');
    });

    it('keeps the default sort and adds a tiebreaker', function (): void {
        UserFactory::new()->count(3)->create();

        $queries = captureOrderedQueries();

        DataTable::query(User::query())
            ->columns([Column::make('status')->sortable()])
            ->defaultSort('status', 'asc')
            ->handle(stablePaginationRequest(1, 25));

        expect($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by status asc, [a-z0-9_]+\.id asc limit \d+(?: offset \d+)?$/');
    });

    it('does not add a tiebreaker to query builder tables without an id column', function (): void {
        Schema::create('sessions', function ($table): void {
            $table->string('token')->primary();
            $table->string('payload');
        });

        DB::table('sessions')->insert(['token' => 'token-1', 'payload' => 'payload']);

        $queries = captureOrderedQueries();

        $result = DataTable::query(DB::table('sessions'))
            ->columns([Column::make('token'), Column::make('payload')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->items())->toHaveCount(1)
            ->and($queries)->toBeEmpty();
    });

    it('does not add a tiebreaker to query builder joins whose table has no id column', function (): void {
        Schema::create('sessions', function ($table): void {
            $table->string('token')->primary();
            $table->string('payload');
        });

        DB::table('sessions')->insert(['token' => 'First', 'payload' => 'payload']);
        DB::table('accounts')->insert(['user_id' => 1, 'label' => 'First']);

        $queries = captureOrderedQueries();

        $result = DataTable::query(
            DB::table('sessions')
                ->join('accounts', 'sessions.token', '=', 'accounts.label')
                ->select('accounts.*'),
        )
            ->columns([Column::make('id'), Column::make('label')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->items())->toHaveCount(1)
            ->and($queries)->toBeEmpty();
    });

    it('adds a tiebreaker to query builder sources with an alias', function (): void {
        UserFactory::new()->count(2)->create();

        $queries = captureOrderedQueries();

        $result = DataTable::query(DB::table('users as u'))
            ->columns([Column::make('id'), Column::make('status')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->items())->toHaveCount(2)
            ->and($queries)->toHaveCount(1)
            ->and(normalizedSql($queries[0]))->toMatch('/order by id asc limit \d+(?: offset \d+)?$/');
    });

    it('does not add a tiebreaker when the eloquent key is missing from the source table', function (): void {
        Schema::create('sessions', function ($table): void {
            $table->string('token')->primary();
            $table->string('payload');
        });

        DB::table('sessions')->insert(['token' => 'token-1', 'payload' => 'payload']);

        $queries = captureOrderedQueries();

        $result = DataTable::query(StablePaginationUser::query()->from('sessions'))
            ->columns([Column::make('token'), Column::make('payload')])
            ->handle(stablePaginationRequest(1, 25));

        expect($result->paginator->items())->toHaveCount(1)
            ->and($queries)->toBeEmpty();
    });
});

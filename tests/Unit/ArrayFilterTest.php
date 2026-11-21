<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Filtering\Filter;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\Processing\QueryProcessor;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;
use Workbench\App\Models\User;

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

describe('FilterCollection: Array filter handling', function (): void {
    it('parses array filter values from request', function (): void {
        $request = Request::create('/test?filters[status][]=active&filters[status][]=inactive');
        $collection = FilterCollection::fromRequest($request, 'filters', 20, 500);

        expect($collection->count())->toBe(1);
        expect($collection->get('status')->value)->toBe(['active', 'inactive']);
    });

    it('parses multiple array filters from request', function (): void {
        $request = Request::create('/test?filters[status][]=active&filters[status][]=inactive&filters[role][]=admin&filters[role][]=user');
        $collection = FilterCollection::fromRequest($request, 'filters', 20, 500);

        expect($collection->count())->toBe(2);
        expect($collection->get('status')->value)->toBe(['active', 'inactive']);
        expect($collection->get('role')->value)->toBe(['admin', 'user']);
    });

    it('mixes scalar and array filters', function (): void {
        $request = Request::create('/test?filters[status]=active&filters[role][]=admin&filters[role][]=user');
        $collection = FilterCollection::fromRequest($request, 'filters', 20, 500);

        expect($collection->count())->toBe(2);
        expect($collection->get('status')->value)->toBe('active');
        expect($collection->get('role')->value)->toBe(['admin', 'user']);
    });

    it('rejects nested arrays', function (): void {
        $request = Request::create('/test?filters[status][0][nested]=value');
        // This creates filters[status][0][nested]=value which is a nested array

        expect(fn (): FilterCollection => FilterCollection::fromRequest($request, 'filters', 20, 500))
            ->toThrow(InvalidFilterException::class, 'Nested arrays are not allowed');
    });

    it('allows flat associative array filter values (e.g. date/number ranges)', function (): void {
        $request = Request::create('/test?filters[created_at][from]=2026-01-01&filters[created_at][to]=2026-01-31');
        $collection = FilterCollection::fromRequest($request, 'filters', 20, 500);

        expect($collection->count())->toBe(1);
        expect($collection->get('created_at')->value)->toBe([
            'from' => '2026-01-01',
            'to' => '2026-01-31',
        ]);
    });

    it('still rejects nested arrays in associative filter values', function (): void {
        // filters[status][foo][nested]=bar creates a nested array
        $request = Request::create('/test?filters[status][foo][nested]=bar');

        expect(fn (): FilterCollection => FilterCollection::fromRequest($request, 'filters', 20, 500))
            ->toThrow(InvalidFilterException::class, 'Nested arrays are not allowed');
    });

    it('truncates string values in associative arrays exceeding max length', function (): void {
        $longValue = str_repeat('a', 600);
        $request = Request::create("/test?filters[created_at][from]={$longValue}&filters[created_at][to]=2026-01-31");
        $collection = FilterCollection::fromRequest($request, 'filters', 20, 500);

        expect($collection->get('created_at')->value['from'])->toHaveLength(500);
        expect($collection->get('created_at')->value['to'])->toBe('2026-01-31');
    });

    it('rejects associative arrays exceeding max values', function (): void {
        $pairs = [];
        foreach (range(1, 25) as $i) {
            $pairs[] = "filters[range][key{$i}]=value{$i}";
        }
        $request = Request::create('/test?'.implode('&', $pairs));

        expect(fn (): FilterCollection => FilterCollection::fromRequest($request, 'filters', 20, 500))
            ->toThrow(InvalidFilterException::class, 'exceeds maximum of 20 items');
    });

    it('rejects arrays exceeding max values', function (): void {
        $values = array_map(fn (int $i): string => "value{$i}", range(1, 25));
        $queryString = implode('&', array_map(fn (string $v): string => "filters[status][]={$v}", $values));
        $request = Request::create("/test?{$queryString}");

        expect(fn (): FilterCollection => FilterCollection::fromRequest($request, 'filters', 20, 500))
            ->toThrow(InvalidFilterException::class, 'exceeds maximum of 20 items');
    });

    it('truncates string values in arrays exceeding max length', function (): void {
        $longValue = str_repeat('a', 600);
        $request = Request::create("/test?filters[status][]={$longValue}&filters[status][]=short");
        $collection = FilterCollection::fromRequest($request, 'filters', 20, 500);

        expect($collection->get('status')->value[0])->toHaveLength(500);
        expect($collection->get('status')->value[1])->toBe('short');
    });

    it('rejects non-scalar values in arrays', function (): void {
        // We can't easily test this via HTTP request, but we can test the sanitizeValue method directly
        // using reflection or by creating a FilterCollection with an array containing an object
        $filter = Filter::make('status', ['valid', new stdClass]);
        $collection = FilterCollection::make([$filter]);

        expect(fn (): FilterCollection => $collection->sanitizeValues(500, 20))
            ->toThrow(InvalidFilterException::class, 'Filter values must be scalar or null');
    });

    it('sanitizes array values after creation - truncates to max values', function (): void {
        $filter = Filter::make('status', ['active', 'inactive', 'pending']);
        $collection = FilterCollection::make([$filter]);

        // Should throw because array has 3 items but max is 2
        expect(fn (): FilterCollection => $collection->sanitizeValues(500, 2))
            ->toThrow(InvalidFilterException::class, 'exceeds maximum of 2 items');
    });

    it('sanitizes array values after creation - within limits', function (): void {
        $filter = Filter::make('status', ['active', 'inactive']);
        $collection = FilterCollection::make([$filter]);

        $sanitized = $collection->sanitizeValues(500, 5); // max 5 values, array has 2

        expect($sanitized->get('status')->value)->toHaveCount(2);
        expect($sanitized->get('status')->value)->toBe(['active', 'inactive']);
    });

    it('validates array values against filter options', function (): void {
        $filter = Filter::make('status', ['active', 'invalid']);
        $collection = FilterCollection::make([$filter]);

        $columnOptions = [
            'status' => [
                ['value' => 'active', 'label' => 'Active'],
                ['value' => 'inactive', 'label' => 'Inactive'],
            ],
        ];

        expect(fn () => $collection->validateAgainstOptions($columnOptions))
            ->toThrow(InvalidFilterException::class, "Value 'invalid' is not in allowed options");
    });

    it('passes validation when all array values are in filter options', function (): void {
        $filter = Filter::make('status', ['active', 'inactive']);
        $collection = FilterCollection::make([$filter]);

        $columnOptions = [
            'status' => [
                ['value' => 'active', 'label' => 'Active'],
                ['value' => 'inactive', 'label' => 'Inactive'],
            ],
        ];

        $collection->validateAgainstOptions($columnOptions); // Should not throw
        expect(true)->toBeTrue();
    });

    it('skips validation for columns without options', function (): void {
        $filter = Filter::make('status', ['active', 'inactive']);
        $collection = FilterCollection::make([$filter]);

        $columnOptions = [
            'role' => [
                ['value' => 'admin', 'label' => 'Admin'],
            ],
        ];

        $collection->validateAgainstOptions($columnOptions); // Should not throw
        expect(true)->toBeTrue();
    });

    it('skips validation for scalar values', function (): void {
        $filter = Filter::make('status', 'active');
        $collection = FilterCollection::make([$filter]);

        $columnOptions = [
            'status' => [
                ['value' => 'active', 'label' => 'Active'],
                ['value' => 'inactive', 'label' => 'Inactive'],
            ],
        ];

        $collection->validateAgainstOptions($columnOptions); // Should not throw
        expect(true)->toBeTrue();
    });
});

describe('QueryProcessor: Array filter application', function (): void {
    $columns = [
        Column::make('name')->searchable()->sortable()->filterable(),
        Column::make('email')->searchable()->sortable()->filterable(),
        Column::make('status')->filterable()->sortable()->filterType('select')->filterOptions([
            ['value' => 'active', 'label' => 'Active'],
            ['value' => 'inactive', 'label' => 'Inactive'],
            ['value' => 'pending', 'label' => 'Pending'],
        ]),
        Column::make('role')->filterable()->sortable(),
        Column::make('is_admin')->filterable()->filterType('boolean'),
        Column::make('created_at')->sortable(),
    ];

    $processor = new QueryProcessor($columns);

    beforeEach(function (): void {
        createUser(['name' => 'John', 'email' => 'john@example.com', 'status' => 'active', 'role' => 'admin']);
        createUser(['name' => 'Jane', 'email' => 'jane@example.com', 'status' => 'inactive', 'role' => 'user']);
        createUser(['name' => 'Bob', 'email' => 'bob@example.com', 'status' => 'active', 'role' => 'user']);
        createUser(['name' => 'Alice', 'email' => 'alice@example.com', 'status' => 'pending', 'role' => 'admin']);
    });

    it('applies array filter with whereIn for scalar columns', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('status', ['active', 'inactive'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(3); // John, Jane, Bob (not Alice who is pending)
    });

    it('applies array filter with whereIn for select filter type', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('status', ['active', 'pending'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(3); // John, Bob, Alice
    });

    it('validates array values against filter options for select type', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('status', ['active', 'invalid'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Value 'invalid' is not in allowed options");
    });

    it('works with QueryBuilder', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('status', ['active', 'inactive'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(Illuminate\Support\Facades\DB::table('users'), $request);

        expect($result->paginator->total())->toBe(3);
    });

    it('returns empty result for empty array filter', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('status', [])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(0);
    });

    it('combines array filter with other filters', function () use ($processor): void {
        $filters = new FilterCollection([
            new Filter('status', ['active', 'pending']),
            new Filter('role', 'admin'),
        ]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        // Active/Pending + Admin = John (active, admin) and Alice (pending, admin)
        expect($result->paginator->total())->toBe(2);
    });

    it('combines array filter with global search', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('status', ['active', 'inactive'])]);
        $request = new DataTableRequest(1, 25, 'john', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('John');
    });

    it('combines array filter with column search', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('status', ['active', 'inactive'])]);
        $searches = new SearchCollection([new TooInfinity\InertiaDataTables\Searching\Search('name', 'jo')]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, $searches, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(1);
        expect($result->paginator->first()->name)->toBe('John');
    });

    it('combines array filter with sort', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('status', ['active', 'inactive'])]);
        $sorts = new SortCollection([new TooInfinity\InertiaDataTables\Sorting\Sort('name', 'asc')]);
        $request = new DataTableRequest(1, 25, '', $sorts, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(3);
        expect($result->paginator->first()->name)->toBe('Bob');
    });
});

describe('QueryProcessor: new filter types (date_range, number_range, multi_select)', function (): void {
    $columns = [
        Column::make('name')->searchable()->sortable()->filterable(),
        Column::make('email')->searchable()->sortable()->filterable(),
        Column::make('status')->filterable()->sortable()->filterType('select')->filterOptions([
            ['value' => 'active', 'label' => 'Active'],
            ['value' => 'inactive', 'label' => 'Inactive'],
            ['value' => 'pending', 'label' => 'Pending'],
        ]),
        Column::make('role')->filterable()->sortable()->filterType('multi_select')->filterOptions([
            ['value' => 'admin', 'label' => 'Admin'],
            ['value' => 'user', 'label' => 'User'],
            ['value' => 'moderator', 'label' => 'Moderator'],
        ]),
        Column::make('created_at')->filterable()->filterType('date_range'),
        Column::make('id')->filterable()->filterType('number_range'),
    ];

    $processor = new QueryProcessor($columns);

    beforeEach(function (): void {
        $password = '$2y$04$wT3wY2K7dKjMh6H7R9uIhe9Zz3E3O6B2I5l9h.8P7v4n3S3T4k6W2';
        User::forceCreate([
            'name' => 'John', 'email' => 'john@example.com', 'password' => $password,
            'status' => 'active', 'role' => 'admin', 'created_at' => '2026-02-15 10:00:00', 'updated_at' => '2026-02-15 10:00:00',
        ]);
        User::forceCreate([
            'name' => 'Jane', 'email' => 'jane@example.com', 'password' => $password,
            'status' => 'inactive', 'role' => 'user', 'created_at' => '2026-03-20 11:00:00', 'updated_at' => '2026-03-20 11:00:00',
        ]);
        User::forceCreate([
            'name' => 'Bob', 'email' => 'bob@example.com', 'password' => $password,
            'status' => 'active', 'role' => 'user', 'created_at' => '2026-05-10 12:00:00', 'updated_at' => '2026-05-10 12:00:00',
        ]);
        User::forceCreate([
            'name' => 'Alice', 'email' => 'alice@example.com', 'password' => $password,
            'status' => 'pending', 'role' => 'admin', 'created_at' => '2026-08-01 13:00:00', 'updated_at' => '2026-08-01 13:00:00',
        ]);
    });

    it('applies date_range filter on Eloquent source (both bounds)', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', ['from' => '2026-01-01', 'to' => '2026-06-30'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(3); // John, Jane, Bob (not Alice who is August)
    });

    it('applies date_range filter on Eloquent source (from only)', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', ['from' => '2026-01-02', 'to' => ''])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(4);
    });

    it('applies date_range filter on Eloquent source (to only)', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', ['from' => '', 'to' => '2026-01-01'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(0);
    });

    it('applies date_range filter on Query Builder source', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', ['from' => '2026-01-01', 'to' => '2026-12-31'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(Illuminate\Support\Facades\DB::table('users'), $request);

        expect($result->paginator->total())->toBe(4);
    });

    it('rejects invalid date_range range where from is after to', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', ['from' => '2026-12-31', 'to' => '2026-01-01'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid range: 'from' must be before or equal to 'to'");
    });

    it('applies number_range filter on Eloquent source (both bounds)', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => '1', 'to' => '2'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(2);
    });

    it('applies number_range filter on Query Builder source', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => '3', 'to' => '4'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(Illuminate\Support\Facades\DB::table('users'), $request);

        expect($result->paginator->total())->toBe(2);
    });

    it('rejects non-numeric values for number_range', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => 'not-a-number', 'to' => '10'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, 'From value must be a number');
    });

    it('applies multi_select filter on Eloquent source', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('role', ['admin', 'moderator'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(2); // John (admin), Alice (admin)
    });

    it('applies multi_select filter on Query Builder source', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('role', ['user'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(Illuminate\Support\Facades\DB::table('users'), $request);

        expect($result->paginator->total())->toBe(2); // Jane (user), Bob (user)
    });

    it('validates multi_select values against filter options', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('role', ['admin', 'guest'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Value 'guest' is not in allowed options");
    });

    it('rejects a scalar multi_select value not in filter options', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('role', 'guest')]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, 'Invalid filter value for column [role]: "guest"');
    });

    it('rejects invalid date_range from date', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', ['from' => 'not-a-date', 'to' => '2026-12-31'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid 'from' date: not-a-date");
    });

    it('rejects invalid date_range to date', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', ['from' => '2026-01-01', 'to' => 'not-a-date'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid 'to' date: not-a-date");
    });

    it('rejects an associative array filter value on a non-range column', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('name', ['from' => 'x', 'to' => 'y'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, 'Associative array filter values are not allowed');
    });

    it('rejects a non-empty list value on a range column', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['1', '2'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, 'Range filter requires');
    });

    it('preserves exact integer bounds for number_range', function () use ($processor): void {
        $largeFrom = '9007199254740993';
        $largeTo = '9007199254740992';

        $filters = new FilterCollection([new Filter('id', ['from' => $largeFrom, 'to' => $largeTo])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid range: 'from' must be before or equal to 'to'");
    });

    it('preserves precision for out-of-range integer bounds', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => '9223372036854775809', 'to' => '9223372036854775808'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid range: 'from' must be before or equal to 'to'");
    });

    it('preserves precision for negative integer bounds', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => '-9007199254740992', 'to' => '-9007199254740993'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid range: 'from' must be before or equal to 'to'");
    });

    it('accepts a valid range when to is a date-only bound', function () use ($processor): void {
        User::forceCreate([
            'name' => 'Later', 'email' => 'later@example.com', 'password' => '$2y$04$wT3wY2K7dKjMh6H7R9uIhe9Zz3E3O6B2I5l9h.8P7v4n3S3T4k6W2',
            'created_at' => '2026-02-15 14:00:00', 'updated_at' => '2026-02-15 14:00:00',
        ]);

        $filters = new FilterCollection([new Filter('created_at', ['from' => '2026-02-15 10:00:00', 'to' => '2026-02-15'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        // John (10:00) and Later (14:00) both fall on 2026-02-15 and must match.
        expect($result->paginator->total())->toBe(2);
    });

    it('rejects a nonexistent calendar date', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', ['from' => '2026-02-30', 'to' => '2026-12-31'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid 'from' date: 2026-02-30");
    });

    it('includes the whole day for a date-only to bound', function () use ($processor): void {
        User::forceCreate([
            'name' => 'Later', 'email' => 'later@example.com', 'password' => '$2y$04$wT3wY2K7dKjMh6H7R9uIhe9Zz3E3O6B2I5l9h.8P7v4n3S3T4k6W2',
            'created_at' => '2026-02-15 14:00:00', 'updated_at' => '2026-02-15 14:00:00',
        ]);

        $filters = new FilterCollection([new Filter('created_at', ['from' => '2026-02-15', 'to' => '2026-02-15'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        // John (10:00) and Later (14:00) both fall on 2026-02-15 and must match.
        expect($result->paginator->total())->toBe(2);
        $names = array_column($result->paginator->items(), 'name');
        sort($names);
        expect($names)->toBe(['John', 'Later']);
    });

    it('rejects inverted decimal range for number_range', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => '9223372036854775808.1', 'to' => '9223372036854775807.2'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid range: 'from' must be before or equal to 'to'");
    });

    it('accepts valid decimal range for number_range', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => '9223372036854775807.2', 'to' => '9223372036854775808.1'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        // No users match this out-of-range decimal interval, but it must not
        // be rejected as inverted.
        expect($result->paginator->total())->toBe(0);
    });

    it('accepts mixed int and decimal bounds for number_range', function () use ($processor): void {
        // from='2.0' (decimal string) vs to=10 (int): 2.0 <= 10, valid range.
        $filters = new FilterCollection([new Filter('id', ['from' => '2.0', 'to' => '10'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        // Users with id 2, 3, 4 match (2.0 <= id <= 10).
        expect($result->paginator->total())->toBe(3);
    });

    it('rejects inverted mixed int and decimal bounds for number_range', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => '10', 'to' => '2.0'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid range: 'from' must be before or equal to 'to'");
    });

    it('accepts equal mixed-representation scientific notation bounds', function () use ($processor): void {
        // from='1e-1' (scientific string) vs to=0.1 (float): both equal 0.1.
        $filters = new FilterCollection([new Filter('id', ['from' => '1e-1', 'to' => 0.1])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        // No users have id 0.1, but the equal bounds must not be rejected.
        expect($result->paginator->total())->toBe(0);
    });

    it('rejects inverted scientific notation bounds for number_range', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('id', ['from' => '1e1', 'to' => '2'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        expect(fn (): TooInfinity\InertiaDataTables\DataTableResult => $processor->process(User::query(), $request))
            ->toThrow(InvalidFilterException::class, "Invalid range: 'from' must be before or equal to 'to'");
    });

    it('accepts dot-leading scientific notation for number_range', function () use ($processor): void {
        // .5e1 = 5, no users have id >= 5, so 0 results but no exception.
        $filters = new FilterCollection([new Filter('id', ['from' => '.5e1', 'to' => '10'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(0);
    });

    it('accepts dot-leading scientific notation as lower bound that matches', function () use ($processor): void {
        // .1e1 = 1, matches users with id 1-4.
        $filters = new FilterCollection([new Filter('id', ['from' => '.1e1', 'to' => '4'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(4);
    });

    it('accepts whitespace-padded decimal bounds for number_range', function () use ($processor): void {
        // from=' 2.0' (with whitespace) vs to='10': 2.0 <= 10, valid range.
        $filters = new FilterCollection([new Filter('id', ['from' => ' 2.0', 'to' => '10'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        // Users with id 2, 3, 4 match (2.0 <= id <= 10).
        expect($result->paginator->total())->toBe(3);
    });

    it('preserves fractional seconds in date_range bounds', function () use ($processor): void {
        // A date-only upper bound expands to the end of the day (23:59:59.999999),
        // so a record later on that day is included even when filtering by date only.
        User::forceCreate([
            'name' => 'Later', 'email' => 'later@example.com',
            'password' => '$2y$04$wT3wY2K7dKjMh6H7R9uIhe9Zz3E3O6B2I5l9h.8P7v4n3S3T4k6W2',
            'created_at' => '2026-02-15 23:59:59', 'updated_at' => '2026-02-15 23:59:59',
        ]);

        $filters = new FilterCollection([new Filter('created_at', [
            'from' => '2026-02-15 00:00:00',
            'to' => '2026-02-15',
        ])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        // John (10:00) and Later (23:59:59) both fall on 2026-02-15 and must match.
        expect($result->paginator->total())->toBe(2);
    });

    it('applies no constraint for empty range filter', function () use ($processor): void {
        $filters = new FilterCollection([new Filter('created_at', [])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $result = $processor->process(User::query(), $request);

        expect($result->paginator->total())->toBe(4);
    });
});

describe('DataTableRequest: Array filter integration', function (): void {
    it('parses array filters from HTTP request', function (): void {
        $request = Request::create('/test?filters[status][]=active&filters[status][]=inactive&page=1&per_page=25');
        $dataTableRequest = DataTableRequest::fromRequest($request);

        expect($dataTableRequest->filters->count())->toBe(1);
        expect($dataTableRequest->filters->get('status')->value)->toBe(['active', 'inactive']);
    });

    it('includes array filters in toArray output', function (): void {
        $filters = new FilterCollection([new Filter('status', ['active', 'inactive'])]);
        $request = new DataTableRequest(1, 25, '', new SortCollection, new SearchCollection, $filters);

        $array = $request->toArray();

        expect($array['filters'])->toHaveCount(1);
        expect($array['filters'][0]['column'])->toBe('status');
        expect($array['filters'][0]['value'])->toBe(['active', 'inactive']);
    });
});

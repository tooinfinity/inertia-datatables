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

    it('rejects associative arrays (non-sequential keys)', function (): void {
        // Simulate filters[status][foo]=bar which creates associative array
        $request = Request::create('/test?filters[status][foo]=bar');

        expect(fn (): FilterCollection => FilterCollection::fromRequest($request, 'filters', 20, 500))
            ->toThrow(InvalidFilterException::class, 'Nested arrays are not allowed');
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

<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\Filtering\Filter;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\Searching\Search;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\Sort;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;

it('creates a column with defaults', function (): void {
    $column = Column::make('name');

    expect($column->name)->toBe('name');
    expect($column->label)->toBe('Name');
    expect($column->searchable)->toBeFalse();
    expect($column->sortable)->toBeFalse();
    expect($column->filterable)->toBeFalse();
    expect($column->hidden)->toBeFalse();
});

it('creates a column with custom label', function (): void {
    $column = Column::make('first_name')->label('First Name');

    expect($column->label)->toBe('First Name');
});

it('creates a searchable column', function (): void {
    $column = Column::make('name')->searchable();

    expect($column->searchable)->toBeTrue();
});

it('creates a sortable column', function (): void {
    $column = Column::make('name')->sortable();

    expect($column->sortable)->toBeTrue();
});

it('creates a filterable column', function (): void {
    $column = Column::make('status')->filterable();

    expect($column->filterable)->toBeTrue();
});

it('creates a hidden column', function (): void {
    $column = Column::make('internal_id')->hidden();

    expect($column->hidden)->toBeTrue();
});

it('chains column methods', function (): void {
    $column = Column::make('email')
        ->label('Email Address')
        ->searchable()
        ->sortable()
        ->filterable()
        ->hidden();

    expect($column->name)->toBe('email');
    expect($column->label)->toBe('Email Address');
    expect($column->searchable)->toBeTrue();
    expect($column->sortable)->toBeTrue();
    expect($column->filterable)->toBeTrue();
    expect($column->hidden)->toBeTrue();
});

it('formats label from snake_case', function (): void {
    expect(Column::make('first_name')->label)->toBe('First Name');
    expect(Column::make('created_at')->label)->toBe('Created At');
    expect(Column::make('user_email')->label)->toBe('User Email');
});

it('formats label from dot notation', function (): void {
    expect(Column::make('company.name')->label)->toBe('Company Name');
});

it('converts column to array', function (): void {
    $column = Column::make('name')->searchable()->sortable();

    expect($column->toArray())->toBe([
        'name' => 'name',
        'label' => 'Name',
        'searchable' => true,
        'sortable' => true,
        'filterable' => false,
        'hidden' => false,
    ]);
});

it('creates a sort', function (): void {
    $sort = Sort::make('name', 'asc');

    expect($sort->column)->toBe('name');
    expect($sort->direction)->toBe('asc');
    expect($sort->isAscending())->toBeTrue();
    expect($sort->isDescending())->toBeFalse();
});

it('creates a sort with desc direction', function (): void {
    $sort = Sort::make('name', 'desc');

    expect($sort->direction)->toBe('desc');
    expect($sort->isDescending())->toBeTrue();
});

it('normalizes sort direction', function (): void {
    expect(Sort::make('name', 'ASC')->direction)->toBe('asc');
    expect(Sort::make('name', 'DESC')->direction)->toBe('desc');
    expect(Sort::make('name', 'invalid')->direction)->toBe('asc');
});

it('converts sort to array', function (): void {
    $sort = Sort::make('name', 'desc');

    expect($sort->toArray())->toBe([
        'column' => 'name',
        'direction' => 'desc',
    ]);
});

it('creates sort collection from query string', function (): void {
    $collection = SortCollection::fromQueryString('name,-created_at,email');

    expect($collection->count())->toBe(3);
    expect($collection->all()[0]->column)->toBe('name');
    expect($collection->all()[0]->direction)->toBe('asc');
    expect($collection->all()[1]->column)->toBe('created_at');
    expect($collection->all()[1]->direction)->toBe('desc');
    expect($collection->all()[2]->column)->toBe('email');
    expect($collection->all()[2]->direction)->toBe('asc');
});

it('handles empty query string', function (): void {
    $collection = SortCollection::fromQueryString('');

    expect($collection->count())->toBe(0);
    expect($collection->isEmpty())->toBeTrue();
});

it('handles query string with only direction prefix', function (): void {
    $collection = SortCollection::fromQueryString('-name');

    expect($collection->count())->toBe(1);
    expect($collection->first()->column)->toBe('name');
    expect($collection->first()->direction)->toBe('desc');
});

it('converts sort collection to query string', function (): void {
    $collection = SortCollection::make([
        Sort::make('name', 'asc'),
        Sort::make('created_at', 'desc'),
    ]);

    expect($collection->toQueryString())->toBe('name,-created_at');
});

it('creates a search', function (): void {
    $search = Search::make('name', 'john');

    expect($search->column)->toBe('name');
    expect($search->value)->toBe('john');
});

it('converts search to array', function (): void {
    $search = Search::make('name', 'john');

    expect($search->toArray())->toBe([
        'column' => 'name',
        'value' => 'john',
    ]);
});

it('creates search collection from request', function (): void {
    $request = new Request;
    $request->query->set('search[name]', 'john');
    $request->query->set('search[email]', 'example');

    $collection = SearchCollection::fromRequest($request, 'search');

    expect($collection->count())->toBe(2);
    expect($collection->get('name')->value)->toBe('john');
    expect($collection->get('email')->value)->toBe('example');
});

it('creates a filter', function (): void {
    $filter = Filter::make('status', 'active');

    expect($filter->column)->toBe('status');
    expect($filter->value)->toBe('active');
});

it('creates a filter with boolean value', function (): void {
    $filter = Filter::make('is_admin', true);

    expect($filter->value)->toBeTrue();
});

it('converts filter to array', function (): void {
    $filter = Filter::make('status', 'active');

    expect($filter->toArray())->toBe([
        'column' => 'status',
        'value' => 'active',
    ]);
});

it('creates filter collection from request', function (): void {
    $request = new Request;
    $request->query->set('filters', [
        'status' => 'active',
        'is_admin' => true,
    ]);

    $collection = FilterCollection::fromRequest($request, 'filters');

    expect($collection->count())->toBe(2);
    expect($collection->get('status')->value)->toBe('active');
    expect($collection->get('is_admin')->value)->toBeTrue();
});

it('ignores empty filter values', function (): void {
    $request = new Request;
    $request->query->set('filters', [
        'status' => 'active',
        'name' => '',
    ]);

    $collection = FilterCollection::fromRequest($request, 'filters');

    expect($collection->count())->toBe(1);
    expect($collection->has('status'))->toBeTrue();
    expect($collection->has('name'))->toBeFalse();
});

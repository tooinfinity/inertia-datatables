<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\DataTableResult;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
use TooInfinity\InertiaDataTables\Query\ColumnResolver;

/**
 * @template TModel of Model
 */
final readonly class QueryProcessor
{
    /**
     * @param  array<int, Column>  $columns
     */
    public function __construct(
        private array $columns,
    ) {}

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    public function process(
        EloquentBuilder|QueryBuilder $query,
        DataTableRequest $request,
        ?string $defaultSortColumn = null,
        string $defaultSortDirection = 'desc',
        ?int $perPageOverride = null,
    ): DataTableResult {
        $this->validateColumns($request);

        $query = $this->applyFilters($query, $request);
        $query = $this->applyGlobalSearch($query, $request);
        $query = $this->applyColumnSearches($query, $request);
        $query = $this->applySorting($query, $request, $defaultSortColumn, $defaultSortDirection);

        $perPage = $this->resolvePerPage($request, $perPageOverride);
        $paginator = $query->paginate($perPage, page: $request->page);

        /** @var array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool}> $columnsArray */
        $columnsArray = array_map(fn (Column $column): array => $column->toArray(), $this->columns);

        return new DataTableResult(
            paginator: $paginator,
            columns: $columnsArray,
            query: $request->toArray(),
        );
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyFilters(EloquentBuilder|QueryBuilder $query, DataTableRequest $request): EloquentBuilder|QueryBuilder
    {
        foreach ($request->filters->all() as $filter) {
            $column = $this->findColumn($filter->column);

            if (! $column->filterable) {
                throw InvalidFilterException::notAllowed($filter->column);
            }

            $resolvedColumn = ColumnResolver::resolve($column->name);

            $query = $this->applyFilter($query, $resolvedColumn, $filter->value);
        }

        return $query;
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyFilter(EloquentBuilder|QueryBuilder $query, string $column, mixed $value): EloquentBuilder|QueryBuilder
    {
        if (is_bool($value)) {
            return $query->where($column, $value);
        }

        if ($value === 'null' || $value === 'NULL') {
            return $query->whereNull($column);
        }

        if ($value === 'not_null' || $value === 'NOT_NULL') {
            return $query->whereNotNull($column);
        }

        if (is_string($value) && str_contains($value, '*')) {
            $value = str_replace('*', '%', $value);

            return $query->where($column, 'LIKE', $value);
        }

        return $query->where($column, $value);
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyGlobalSearch(EloquentBuilder|QueryBuilder $query, DataTableRequest $request): EloquentBuilder|QueryBuilder
    {
        $search = $request->search;

        if ($search === '') {
            return $query;
        }

        $searchableColumns = array_filter($this->columns, fn (Column $c): bool => $c->searchable);

        if ($searchableColumns === []) {
            return $query;
        }

        return $query->where(function (EloquentBuilder|QueryBuilder $q) use ($search, $searchableColumns): void {
            foreach ($searchableColumns as $column) {
                $resolvedColumn = ColumnResolver::resolve($column->name);
                $q->orWhere($resolvedColumn, 'LIKE', "%{$search}%");
            }
        });
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyColumnSearches(EloquentBuilder|QueryBuilder $query, DataTableRequest $request): EloquentBuilder|QueryBuilder
    {
        foreach ($request->searches->all() as $search) {
            $column = $this->findColumn($search->column);

            if (! $column->searchable) {
                throw InvalidColumnException::notAllowed($search->column, 'search');
            }

            $resolvedColumn = ColumnResolver::resolve($column->name);

            $query->where($resolvedColumn, 'LIKE', "%{$search->value}%");
        }

        return $query;
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applySorting(
        EloquentBuilder|QueryBuilder $query,
        DataTableRequest $request,
        ?string $defaultSortColumn,
        string $defaultSortDirection,
    ): EloquentBuilder|QueryBuilder {
        $sorts = $request->sorts->all();

        if ($sorts === []) {
            if ($defaultSortColumn !== null) {
                $defaultColumn = $this->findColumn($defaultSortColumn);

                if (! $defaultColumn->sortable) {
                    throw InvalidSortException::notAllowed($defaultSortColumn);
                }

                $resolvedColumn = ColumnResolver::resolve($defaultColumn->name);

                return $query->orderBy($resolvedColumn, $defaultSortDirection);
            }

            return $query;
        }

        foreach ($sorts as $sort) {
            $column = $this->findColumn($sort->column);

            if (! $column->sortable) {
                throw InvalidSortException::notAllowed($sort->column);
            }

            $resolvedColumn = ColumnResolver::resolve($column->name);

            $query->orderBy($resolvedColumn, $sort->direction);
        }

        return $query;
    }

    private function validateColumns(DataTableRequest $request): void
    {
        $allowedColumns = array_column($this->columns, 'name', 'name');

        foreach ($request->sorts->all() as $sort) {
            if (! isset($allowedColumns[$sort->column])) {
                throw InvalidSortException::notAllowed($sort->column);
            }
        }

        foreach ($request->filters->all() as $filter) {
            if (! isset($allowedColumns[$filter->column])) {
                throw InvalidFilterException::notAllowed($filter->column);
            }
        }

        foreach ($request->searches->all() as $search) {
            if (! isset($allowedColumns[$search->column])) {
                throw InvalidColumnException::notAllowed($search->column, 'search');
            }
        }
    }

    private function findColumn(string $name): Column
    {
        foreach ($this->columns as $column) {
            if ($column->name === $name) {
                return $column;
            }
        }

        throw InvalidColumnException::notFound($name);
    }

    private function resolvePerPage(DataTableRequest $request, ?int $override): int
    {
        $maxPerPage = config('inertia-datatables.max_per_page', 100);
        $perPage = $override ?? $request->perPage;

        return min(max(1, $perPage), $maxPerPage);
    }
}

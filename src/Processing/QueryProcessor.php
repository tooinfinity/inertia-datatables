<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\PostgresConnection;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Database\Query\Expression;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\DataTableResult;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
use TooInfinity\InertiaDataTables\Sorting\Sort;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;

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
     * @return DataTableResult<TModel>
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

        $sorts = $this->resolveSorts($request, $defaultSortColumn, $defaultSortDirection);
        $query = $this->applySorting($query, $request, $defaultSortColumn, $defaultSortDirection);

        /** @var int $maxPerPage */
        $maxPerPage = config('inertia-datatables.max_per_page', 100);
        $perPage = $this->resolvePerPage($request, $perPageOverride, $maxPerPage);
        $paginator = $query->paginate($perPage, page: $request->page);

        /** @var array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: string, label: string}>}> $columnsArray */
        $columnsArray = array_map(fn (Column $column): array => $column->toArray(), $this->columns);

        /** @var int $debounce */
        $debounce = config('inertia-datatables.search.debounce', 300);
        $perPageOptions = $this->resolvePerPageOptions($perPage, $maxPerPage);

        $queryState = $request->toArray();
        $queryState['per_page'] = $perPage;
        $queryState['sort'] = $sorts->toArray();

        $config = [
            'debounce' => $debounce,
            'per_page_options' => $perPageOptions,
        ];

        /** @var \Illuminate\Contracts\Pagination\LengthAwarePaginator<array-key, TModel> $paginator */
        return new DataTableResult(
            paginator: $paginator,
            columns: $columnsArray,
            query: $queryState,
            config: $config,
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
                throw InvalidFilterException::notAllowed($filter->column)->forRequest();
            }

            $query = $this->applyFilter($query, $column, $filter->value);
        }

        return $query;
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyFilter(EloquentBuilder|QueryBuilder $query, Column $column, mixed $value): EloquentBuilder|QueryBuilder
    {
        // Handle array values - use whereIn for multi-value filtering
        if (is_array($value)) {
            // For select filter type, validate against allowed options
            if ($column->filterType === 'select' && $column->filterOptions !== []) {
                $allowedValues = array_column($column->filterOptions, 'value');
                foreach ($value as $item) {
                    $itemString = is_string($item) ? $item : json_encode($item);
                    if (! in_array($item, $allowedValues, true)) {
                        throw InvalidFilterException::invalidValue($column->name, "Value '{$itemString}' is not in allowed options");
                    }
                }
            }

            // Empty array means no results
            if ($value === []) {
                return $query->whereRaw('1 = 0');
            }

            return $query->whereIn($column->name, $value);
        }

        // Handle boolean string values ("true"/"false"/"1"/"0") for any filterable column
        // This allows boolean filtering without requiring filterType('boolean')
        if (is_string($value)) {
            $lowerValue = strtolower($value);
            if (in_array($lowerValue, ['true', '1'], true)) {
                return $query->where($column->name, true);
            }
            if (in_array($lowerValue, ['false', '0'], true)) {
                return $query->where($column->name, false);
            }
        }

        // Handle boolean filter type - query params send "true"/"false" as strings
        // (kept for backward compatibility with explicit filterType('boolean'))
        if ($column->filterType === 'boolean') {
            if (in_array($value, ['true', 'True', '1'], true)) {
                return $query->where($column->name, true);
            }
            if (in_array($value, ['false', 'False', '0'], true)) {
                return $query->where($column->name, false);
            }
        }

        if (is_bool($value)) {
            return $query->where($column->name, $value);
        }

        if ($value === 'null' || $value === 'NULL') {
            return $query->whereNull($column->name);
        }

        if ($value === 'not_null' || $value === 'NOT_NULL') {
            return $query->whereNotNull($column->name);
        }

        if (is_string($value) && str_contains($value, '*')) {
            $pattern = $this->escapeLikeValue($value, allowWildcards: true);

            $this->applyLike($query, $column->name, $pattern);

            return $query;
        }

        return $query->where($column->name, $value);
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

        $search = $this->escapeLikeValue($search);

        return $query->where(function (EloquentBuilder|QueryBuilder $q) use ($search, $searchableColumns): void {
            foreach ($searchableColumns as $column) {
                $this->applyLike($q, $column->name, "%{$search}%", 'or');
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
                throw InvalidColumnException::notAllowed($search->column, 'search')->forRequest();
            }

            $escaped = $this->escapeLikeValue($search->value);

            $this->applyLike($query, $column->name, "%{$escaped}%");
        }

        return $query;
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'and'|'or'  $boolean
     */
    private function applyLike(
        EloquentBuilder|QueryBuilder $query,
        string $column,
        string $pattern,
        string $boolean = 'and',
    ): void {
        $queryBuilder = $query instanceof EloquentBuilder
            ? $query->getQuery()
            : $query;

        // Keep the pattern bound while placing the portable escape clause after its placeholder.
        $queryBuilder->where(
            $column,
            $this->likeOperator($queryBuilder),
            new Expression("? ESCAPE '!'"),
            $boolean,
        );
        $queryBuilder->addBinding($pattern);
    }

    /**
     * Resolve the case-insensitive LIKE operator for the underlying connection.
     *
     * SQLite and MySQL compare LIKE case-insensitively by default, while
     * PostgreSQL's LIKE is case-sensitive. Using ILIKE on PostgreSQL keeps
     * search results identical across every supported driver.
     */
    private function likeOperator(QueryBuilder $queryBuilder): string
    {
        return $queryBuilder->getConnection() instanceof PostgresConnection
            ? 'ilike'
            : 'like';
    }

    private function escapeLikeValue(string $value, bool $allowWildcards = false): string
    {
        $value = str_replace(
            ['!', '%', '_', '\\'],
            ['!!', '!%', '!_', '!\\'],
            $value,
        );

        if ($allowWildcards) {
            $value = str_replace('*', '%', $value);
        }

        return $value;
    }

    private function resolveSorts(
        DataTableRequest $request,
        ?string $defaultSortColumn,
        string $defaultSortDirection,
    ): SortCollection {
        if ($request->sorts->isNotEmpty()) {
            return $request->sorts;
        }

        if ($defaultSortColumn === null) {
            return $request->sorts;
        }

        return SortCollection::make([
            Sort::make($defaultSortColumn, $defaultSortDirection),
        ]);
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

                /** @var 'asc'|'desc' $defaultSortDirection */
                return $query->orderBy($defaultColumn->name, $defaultSortDirection);
            }

            return $query;
        }

        foreach ($sorts as $sort) {
            $column = $this->findColumn($sort->column);

            if (! $column->sortable) {
                throw InvalidSortException::notAllowed($sort->column)->forRequest();
            }

            $direction = strtolower($sort->direction);
            if (! in_array($direction, ['asc', 'desc'], true)) {
                throw InvalidSortException::invalidDirection($sort->direction)->forRequest();
            }

            /** @var 'asc'|'desc' $direction */
            $query->orderBy($column->name, $direction);
        }

        return $query;
    }

    private function validateColumns(DataTableRequest $request): void
    {
        $allowedColumns = array_column($this->columns, 'name', 'name');

        foreach ($request->sorts->all() as $sort) {
            if (! isset($allowedColumns[$sort->column])) {
                throw InvalidSortException::notAllowed($sort->column)->forRequest();
            }
        }

        foreach ($request->filters->all() as $filter) {
            if (! isset($allowedColumns[$filter->column])) {
                throw InvalidFilterException::notAllowed($filter->column)->forRequest();
            }
        }

        foreach ($request->searches->all() as $search) {
            if (! isset($allowedColumns[$search->column])) {
                throw InvalidColumnException::notAllowed($search->column, 'search')->forRequest();
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

    private function resolvePerPage(
        DataTableRequest $request,
        ?int $defaultPerPage,
        int $maxPerPage,
    ): int {
        $perPage = $request->perPageProvided
            ? $request->perPage
            : ($defaultPerPage ?? $request->perPage);

        return min(max(1, $perPage), $maxPerPage);
    }

    /**
     * @return array<int, int>
     */
    private function resolvePerPageOptions(int $perPage, int $maxPerPage): array
    {
        /** @var array<int, int> $configuredOptions */
        $configuredOptions = config('inertia-datatables.per_page_options', [10, 25, 50, 100]);

        $options = array_values(array_unique(array_filter(
            $configuredOptions,
            fn (int $option): bool => $option >= 1 && $option <= $maxPerPage,
        )));

        if (! in_array($perPage, $options, true)) {
            $options[] = $perPage;
        }

        sort($options);

        return $options;
    }
}

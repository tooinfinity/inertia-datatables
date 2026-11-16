<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Closure;
use Illuminate\Contracts\Database\Query\Expression as ExpressionContract;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\PostgresConnection;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Database\Query\Expression;
use ReflectionMethod;
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
        private bool $exposeAll = false,
        private ?string $responseKey = null,
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

        $query = $this->applyColumnFields($query);
        $query = $this->applyRelationLoads($query);

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
            exposeAll: $this->exposeAll,
            responseKey: $this->responseKey,
            computedValues: $this->computeColumnValues($paginator->items(), $query),
        );
    }

    /**
     * Select the database expression of every column that declares one.
     *
     * The expression is selected under the column name so the value is exposed
     * with the same key the frontend uses to read the cell.
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyColumnFields(EloquentBuilder|QueryBuilder $query): EloquentBuilder|QueryBuilder
    {
        foreach ($this->columns as $column) {
            if ($column->field === null || $column->relation !== null || $column->value !== null) {
                continue;
            }

            $queryBuilder = $query instanceof EloquentBuilder ? $query->getQuery() : $query;
            $table = $this->plainTable($queryBuilder->from);

            if ($queryBuilder->columns === null && $table !== null) {
                $queryBuilder->select($table.'.*');
            }

            $queryBuilder->addSelect($this->aliasedField($column));
        }

        return $query;
    }

    /**
     * Eager load every relationship a column reads its value from.
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyRelationLoads(EloquentBuilder|QueryBuilder $query): EloquentBuilder|QueryBuilder
    {
        $relations = [];
        $relationColumn = null;

        foreach ($this->columns as $column) {
            if ($column->relation === null) {
                continue;
            }

            $relations[$column->relation] = $column->relation;
            $relationColumn ??= $column;
        }

        if ($relations === [] || $relationColumn === null) {
            return $query;
        }

        $this->eloquentQuery($query, $relationColumn)->with(array_values($relations));

        return $query;
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
        if ($column->filterUsing instanceof Closure) {
            return $this->applyCallback($column->filterUsing, $query, $value);
        }

        if ($column->relation !== null) {
            return $this->applyRelationFilter($query, $column, $value);
        }

        return $this->applyFilterToColumn($query, $column, $this->fieldExpression($column), $value);
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @return EloquentBuilder<TQueryModel>|QueryBuilder
     */
    private function applyFilterToColumn(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $target,
        mixed $value,
    ): EloquentBuilder|QueryBuilder {
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

            return $query->whereIn($target, $value);
        }

        // Handle boolean string values ("true"/"false"/"1"/"0") for any filterable column
        // This allows boolean filtering without requiring filterType('boolean')
        if (is_string($value)) {
            $lowerValue = strtolower($value);
            if (in_array($lowerValue, ['true', '1'], true)) {
                return $query->where($target, true);
            }
            if (in_array($lowerValue, ['false', '0'], true)) {
                return $query->where($target, false);
            }
        }

        // Handle boolean filter type - query params send "true"/"false" as strings
        // (kept for backward compatibility with explicit filterType('boolean'))
        if ($column->filterType === 'boolean') {
            if (in_array($value, ['true', 'True', '1'], true)) {
                return $query->where($target, true);
            }
            if (in_array($value, ['false', 'False', '0'], true)) {
                return $query->where($target, false);
            }
        }

        if (is_bool($value)) {
            return $query->where($target, $value);
        }

        if ($value === 'null' || $value === 'NULL') {
            return $query->whereNull($target);
        }

        if ($value === 'not_null' || $value === 'NOT_NULL') {
            return $query->whereNotNull($target);
        }

        if (is_string($value) && str_contains($value, '*')) {
            $pattern = $this->escapeLikeValue($value, allowWildcards: true);

            $this->applyLike($query, $target, $pattern);

            return $query;
        }

        return $query->where($target, $value);
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @return EloquentBuilder<TQueryModel>|QueryBuilder
     */
    private function applyRelationFilter(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        mixed $value,
    ): EloquentBuilder|QueryBuilder {
        $eloquent = $this->eloquentQuery($query, $column);
        $relation = $this->relationFor($eloquent, $column);
        $metadata = $this->relationMetadata($relation, $column);

        $eloquent->has($this->relationName($column), '>=', 1, 'and', function (EloquentBuilder $related) use ($column, $metadata, $value): void {
            $this->applyFilterToColumn($related, $column, $metadata['relatedColumn'], $value);
        });

        return $query;
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

        $escaped = $this->escapeLikeValue($search);

        return $query->where(function (EloquentBuilder|QueryBuilder $q) use ($escaped, $searchableColumns): void {
            foreach ($searchableColumns as $column) {
                $this->applySearchToColumn($q, $column, $escaped, 'or');
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

            $this->applySearchToColumn($query, $column, $escaped, 'and');
        }

        return $query;
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'and'|'or'  $boolean
     */
    private function applySearchToColumn(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $term,
        string $boolean,
    ): void {
        if ($column->searchUsing instanceof Closure) {
            $this->applyCallback($column->searchUsing, $query, $term, $boolean);

            return;
        }

        if ($column->relation !== null) {
            $this->applyRelationSearch($query, $column, $term, $boolean);

            return;
        }

        $this->applyLike($query, $this->fieldExpression($column), "%{$term}%", $boolean);
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'and'|'or'  $boolean
     */
    private function applyRelationSearch(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $term,
        string $boolean,
    ): void {
        $eloquent = $this->eloquentQuery($query, $column);
        $relation = $this->relationFor($eloquent, $column);
        $metadata = $this->relationMetadata($relation, $column);

        $eloquent->has($this->relationName($column), '>=', 1, $boolean, function (EloquentBuilder $related) use ($metadata, $term): void {
            $this->applyLike($related, $metadata['relatedColumn'], "%{$term}%");
        });
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
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

                $query = $this->applySortToColumn($query, $defaultColumn, $this->normalizeDirection($defaultSortDirection));
            }
        } else {
            foreach ($sorts as $sort) {
                $column = $this->findColumn($sort->column);

                if (! $column->sortable) {
                    throw InvalidSortException::notAllowed($sort->column)->forRequest();
                }

                $direction = strtolower($sort->direction);
                if (! in_array($direction, ['asc', 'desc'], true)) {
                    throw InvalidSortException::invalidDirection($sort->direction)->forRequest();
                }

                $query = $this->applySortToColumn($query, $column, $direction);
            }
        }

        return $this->applyTiebreaker($query);
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'asc'|'desc'  $direction
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applySortToColumn(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $direction,
    ): EloquentBuilder|QueryBuilder {
        if ($column->sortUsing instanceof Closure) {
            return $this->applyCallback($column->sortUsing, $query, $direction);
        }

        if ($column->relation !== null) {
            return $this->applyRelationSort($query, $column, $direction);
        }

        return $query->orderBy($this->fieldExpression($column), $direction);
    }

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'asc'|'desc'  $direction
     * @return EloquentBuilder<TModel>
     */
    private function applyRelationSort(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $direction,
    ): EloquentBuilder {
        $eloquent = $this->eloquentQuery($query, $column);
        $relation = $this->relationFor($eloquent, $column);
        $metadata = $this->relationMetadata($relation, $column);

        $subquery = $relation->getRelated()->newQuery()
            ->select($metadata['relatedColumn'])
            ->whereColumn(
                $metadata['relatedTable'].'.'.$metadata['relatedKey'],
                $metadata['parentTable'].'.'.$metadata['parentKey'],
            )
            ->limit(1);

        return $eloquent->orderBy($subquery, $direction);
    }

    /**
     * Append a unique ordering column so pagination remains deterministic.
     *
     * Rows that share the sorted values may otherwise move between pages
     * because SQL does not guarantee a stable order. The tiebreaker is only
     * applied when the query shape allows a unique row key to be referenced.
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyTiebreaker(EloquentBuilder|QueryBuilder $query): EloquentBuilder|QueryBuilder
    {
        $queryBuilder = $query instanceof EloquentBuilder
            ? $query->getQuery()
            : $query;

        if (($queryBuilder->unions ?? []) !== []) {
            return $this->applyUnionTiebreaker($query, $queryBuilder);
        }

        if (($queryBuilder->groups ?? []) !== []) {
            return $this->applyGroupedTiebreaker($query, $queryBuilder);
        }

        if (($queryBuilder->havings ?? []) !== []) {
            return $query;
        }

        $tiebreaker = $query instanceof EloquentBuilder
            ? $this->resolveEloquentTiebreaker($query, $queryBuilder)
            : $this->resolveQueryBuilderTiebreaker($queryBuilder);

        if ($tiebreaker === null) {
            return $query;
        }

        if ($this->isOrderedBy($queryBuilder, ...$tiebreaker['equivalents'])) {
            return $query;
        }

        return $query->orderBy($tiebreaker['column'], 'asc');
    }

    /**
     * Resolve the Eloquent row key that makes the ordering unique.
     *
     * @param  EloquentBuilder<TModel>  $query
     * @return array{column: string, equivalents: array<int, string>}|null
     */
    private function resolveEloquentTiebreaker(
        EloquentBuilder $query,
        QueryBuilder $queryBuilder,
    ): ?array {
        $qualifier = $this->resolveTableQualifier($queryBuilder);

        if ($qualifier === null) {
            return null;
        }

        $keyName = $query->getModel()->getKeyName();
        $qualifiedKeyName = $qualifier.'.'.$keyName;

        if ($queryBuilder->distinct !== false) {
            if ($queryBuilder->distinct !== true) {
                return null;
            }

            return $this->findProjectedKey($queryBuilder, $keyName, $qualifier, $qualifiedKeyName);
        }

        if ($this->isAggregateOnlyProjection($queryBuilder)) {
            return null;
        }

        return [
            'column' => $qualifiedKeyName,
            'equivalents' => array_values(array_unique([$qualifiedKeyName, $keyName])),
        ];
    }

    /**
     * Resolve the Query Builder row key that makes the ordering unique.
     *
     * @return array{column: string, equivalents: array<int, string>}|null
     */
    private function resolveQueryBuilderTiebreaker(QueryBuilder $queryBuilder): ?array
    {
        $keyName = 'id';
        $qualifier = $this->resolveTableQualifier($queryBuilder);

        if ($qualifier === null) {
            return null;
        }

        $hasJoins = ($queryBuilder->joins ?? []) !== [];

        if ($queryBuilder->distinct !== false) {
            if ($queryBuilder->distinct !== true) {
                return null;
            }

            $wildcardKey = $hasJoins ? $qualifier.'.'.$keyName : $keyName;

            return $this->findProjectedKey($queryBuilder, $keyName, $qualifier, $wildcardKey);
        }

        if ($this->isAggregateOnlyProjection($queryBuilder)) {
            return null;
        }

        if ($hasJoins) {
            $qualifiedKeyName = $qualifier.'.'.$keyName;

            return [
                'column' => $qualifiedKeyName,
                'equivalents' => array_values(array_unique([$qualifiedKeyName, $keyName])),
            ];
        }

        return [
            'column' => $keyName,
            'equivalents' => [$keyName],
        ];
    }

    /**
     * Order union results by the projected row key.
     *
     * A union is ordered by the column names of its output, so the row key is
     * referenced without a table qualifier.
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyUnionTiebreaker(
        EloquentBuilder|QueryBuilder $query,
        QueryBuilder $queryBuilder,
    ): EloquentBuilder|QueryBuilder {
        $keyName = $query instanceof EloquentBuilder
            ? $query->getModel()->getKeyName()
            : 'id';

        $qualifier = $this->resolveTableQualifier($queryBuilder);
        $outputKey = $this->findProjectedKeyOutput($queryBuilder, $keyName, $qualifier);

        if ($outputKey === null) {
            return $query;
        }

        if ($this->isOrderedBy($queryBuilder, $outputKey, $keyName)) {
            return $query;
        }

        return $query->orderBy($outputKey, 'asc');
    }

    /**
     * Order grouped rows by their grouping columns.
     *
     * Raw group expressions cannot be reused as ordering terms because their
     * bindings and dialect specific semantics may differ.
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyGroupedTiebreaker(
        EloquentBuilder|QueryBuilder $query,
        QueryBuilder $queryBuilder,
    ): EloquentBuilder|QueryBuilder {
        $groups = $queryBuilder->groups ?? [];

        foreach ($groups as $group) {
            if (! is_string($group)) {
                return $query;
            }
        }

        if ($queryBuilder->distinct !== false && $queryBuilder->distinct !== true) {
            return $query;
        }

        $qualifier = $this->resolveTableQualifier($queryBuilder);
        $candidates = [];

        foreach ($groups as $group) {
            if (! $queryBuilder->distinct) {
                $candidates[] = ['column' => $group, 'equivalents' => [$group]];

                continue;
            }

            $candidate = $this->findProjectedGroup($queryBuilder, $group, $qualifier);

            if ($candidate === null) {
                return $query;
            }

            $candidates[] = $candidate;
        }

        foreach ($candidates as $candidate) {
            if ($this->isOrderedBy($queryBuilder, ...$candidate['equivalents'])) {
                continue;
            }

            $query->orderBy($candidate['column'], 'asc');
        }

        return $query;
    }

    /**
     * Find the grouping column in the projection of a distinct query.
     *
     * Distinct queries may only be ordered by expressions that are projected,
     * so the projected expression is used instead of the grouping column.
     *
     * @return array{column: string, equivalents: array<int, string>}|null
     */
    private function findProjectedGroup(
        QueryBuilder $queryBuilder,
        string $group,
        ?string $qualifier,
    ): ?array {
        foreach ($this->projectionItems($queryBuilder) as $item) {
            if ($this->isBaseWildcard($item['source'], $qualifier)) {
                return ['column' => $group, 'equivalents' => [$group]];
            }

            if (! $this->projectionMatchesGroup($item['source'], $group, $qualifier)) {
                continue;
            }

            $column = $item['alias'] ?? $item['source'];

            return [
                'column' => $column,
                'equivalents' => array_values(array_unique([$column, $group, $item['source']])),
            ];
        }

        return null;
    }

    /**
     * Find the row key in a selected projection.
     *
     * @return array{column: string, equivalents: array<int, string>}|null
     */
    private function findProjectedKey(
        QueryBuilder $queryBuilder,
        string $keyName,
        ?string $qualifier,
        string $wildcardKey,
    ): ?array {
        $columns = $queryBuilder->columns;

        if ($columns === null) {
            return $this->tiebreakerCandidate($wildcardKey, $keyName, $qualifier);
        }

        foreach ($this->projectionItems($queryBuilder) as $item) {
            if ($this->isBaseWildcard($item['source'], $qualifier)) {
                return $this->tiebreakerCandidate($wildcardKey, $keyName, $qualifier);
            }

            if (! $this->projectionMatchesKey($item['source'], $keyName, $qualifier)) {
                continue;
            }

            $projectedKey = $item['alias'] ?? $item['source'];

            return $this->tiebreakerCandidate($projectedKey, $keyName, $qualifier, $item['source']);
        }

        return null;
    }

    /**
     * Find the name of the row key in the output of a union.
     */
    private function findProjectedKeyOutput(
        QueryBuilder $queryBuilder,
        string $keyName,
        ?string $qualifier,
    ): ?string {
        $columns = $queryBuilder->columns;

        if ($columns === null) {
            return $keyName;
        }

        foreach ($this->projectionItems($queryBuilder) as $item) {
            if ($this->isBaseWildcard($item['source'], $qualifier)) {
                return $keyName;
            }

            if (! $this->projectionMatchesKey($item['source'], $keyName, $qualifier)) {
                continue;
            }

            return $item['alias'] ?? $keyName;
        }

        return null;
    }

    /**
     * Build a tiebreaker and the equivalent columns that prevent duplication.
     *
     * @return array{column: string, equivalents: array<int, string>}
     */
    private function tiebreakerCandidate(
        string $column,
        string $keyName,
        ?string $qualifier,
        string ...$additionalEquivalents
    ): array {
        $equivalents = [$column, $keyName, ...$additionalEquivalents];

        if ($qualifier !== null) {
            $equivalents[] = $qualifier.'.'.$keyName;
        }

        return [
            'column' => $column,
            'equivalents' => array_values(array_unique($equivalents)),
        ];
    }

    /**
     * Resolve the individual select items of a projection.
     *
     * Raw projections may contain multiple comma separated items, while plain
     * projections always describe a single item.
     *
     * @return array<int, array{source: string, alias: string|null}>
     */
    private function projectionItems(QueryBuilder $queryBuilder): array
    {
        $columns = $queryBuilder->columns;

        if ($columns === null) {
            return [];
        }

        $items = [];

        foreach ($columns as $column) {
            if ($column instanceof ExpressionContract) {
                $value = (string) $column->getValue($queryBuilder->getGrammar());

                foreach ($this->splitProjectionList($value) as $part) {
                    [$source, $alias] = $this->parseProjection($part);

                    $items[] = ['source' => $source, 'alias' => $alias];
                }

                continue;
            }

            [$source, $alias] = $this->parseProjection($column);

            $items[] = ['source' => $source, 'alias' => $alias];
        }

        return $items;
    }

    /**
     * Split a raw projection into its individual select items.
     *
     * @return array<int, string>
     */
    private function splitProjectionList(string $projection): array
    {
        $items = [];
        $current = '';
        $depth = 0;
        $quote = null;
        $length = strlen($projection);

        for ($index = 0; $index < $length; $index++) {
            $character = $projection[$index];

            if ($quote !== null) {
                $current .= $character;

                if ($character === '\\' && $quote !== '`' && $index + 1 < $length) {
                    $index++;
                    $current .= $projection[$index];

                    continue;
                }

                if ($character === $quote) {
                    if ($index + 1 < $length && $projection[$index + 1] === $quote) {
                        $index++;
                        $current .= $projection[$index];

                        continue;
                    }

                    $quote = null;
                }

                continue;
            }

            if (in_array($character, ["'", '"', '`'], true)) {
                $quote = $character;
                $current .= $character;

                continue;
            }

            if ($character === '(') {
                $depth++;
            } elseif ($character === ')') {
                $depth--;
            } elseif ($character === ',' && $depth === 0) {
                $items[] = $current;
                $current = '';

                continue;
            }

            $current .= $character;
        }

        $items[] = $current;

        return array_values(array_filter(
            array_map(trim(...), $items),
            fn (string $item): bool => $item !== '',
        ));
    }

    /**
     * Parse a projected expression and its optional alias.
     *
     * @return array{0: string, 1: string|null}
     */
    private function parseProjection(string $value): array
    {
        $value = trim($value);

        $pattern = '/^(.*?)\s+as\s+(?:"(?<quoted>[^"]+)"|`(?<ticked>[^`]+)`|(?<plain>[a-z_][a-z0-9_]*))$/i';

        if (preg_match($pattern, $value, $matches, PREG_UNMATCHED_AS_NULL) !== 1) {
            return [$value, null];
        }

        $alias = $matches['quoted'] ?? $matches['ticked'] ?? $matches['plain'] ?? null;

        return [trim($matches[1]), $alias];
    }

    private function normalizeIdentifier(string $identifier): string
    {
        return strtolower(str_replace(['`', '"'], '', trim($identifier)));
    }

    /**
     * Determine whether a projection selects every column of the base table.
     */
    private function isBaseWildcard(string $projection, ?string $qualifier): bool
    {
        $projection = $this->normalizeIdentifier($projection);

        if ($projection === '*') {
            return true;
        }

        if ($qualifier === null) {
            return false;
        }

        return $projection === strtolower($qualifier).'.*';
    }

    private function projectionMatchesKey(string $projection, string $keyName, ?string $qualifier): bool
    {
        $projection = $this->normalizeIdentifier($projection);

        if ($projection === strtolower($keyName)) {
            return true;
        }

        return $qualifier !== null
            && $projection === strtolower($qualifier).'.'.strtolower($keyName);
    }

    /**
     * Determine whether a projection selects the given grouping column.
     */
    private function projectionMatchesGroup(string $projection, string $group, ?string $qualifier): bool
    {
        $projection = $this->normalizeIdentifier($projection);
        $group = $this->normalizeIdentifier($group);

        if ($projection === $group) {
            return true;
        }

        $projectionParts = explode('.', $projection);
        $groupParts = explode('.', $group);

        $projectionColumn = $projectionParts[count($projectionParts) - 1];
        $groupColumn = $groupParts[count($groupParts) - 1];

        if ($projectionColumn !== $groupColumn) {
            return false;
        }

        $projectionTable = count($projectionParts) > 1 ? $projectionParts[count($projectionParts) - 2] : null;
        $groupTable = count($groupParts) > 1 ? $groupParts[count($groupParts) - 2] : null;

        if ($projectionTable !== null && $groupTable !== null) {
            return $projectionTable === $groupTable;
        }

        $baseTable = $qualifier === null ? null : strtolower($qualifier);

        return $projectionTable === $baseTable || $groupTable === $baseTable;
    }

    /**
     * Determine whether the projection only contains aggregate expressions.
     *
     * Aggregate only queries do not represent rows and therefore cannot be
     * ordered by a row key.
     */
    private function isAggregateOnlyProjection(QueryBuilder $queryBuilder): bool
    {
        $columns = $queryBuilder->columns;

        if ($columns === null || $columns === []) {
            return false;
        }

        $items = $this->projectionItems($queryBuilder);

        if ($items === []) {
            return false;
        }

        return array_all($items, $this->isAggregateProjectionItem(...));
    }

    /**
     * Determine whether a projected item aggregates rows.
     *
     * @param  array{source: string, alias: string|null}  $item
     */
    private function isAggregateProjectionItem(array $item): bool
    {
        return $this->isAggregateExpression($item['source']);
    }

    /**
     * Determine whether a projected expression aggregates rows.
     */
    private function isAggregateExpression(string $source): bool
    {
        if (preg_match('/\bover\s*\(/i', $source) === 1) {
            return false;
        }

        $aggregates = 'array_agg|avg|bit_and|bit_or|bool_and|bool_or|count|every|group_concat|json_agg|json_arrayagg|json_group_array|jsonb_agg|jsonb_arrayagg|max|min|mode|percentile_cont|percentile_disc|stddev|stddev_pop|stddev_samp|string_agg|sum|total|var_pop|var_samp|variance|xmlagg|[a-z_]+_agg(?:reg)?';

        return preg_match('/\b(?:'.$aggregates.')\s*\(/i', $source) === 1;
    }

    /**
     * Resolve the table name or alias used by the query.
     */
    private function resolveTableQualifier(QueryBuilder $queryBuilder): ?string
    {
        $from = $queryBuilder->from;

        if (! is_string($from)) {
            return null;
        }

        $from = trim($from);

        if ($from === '') {
            return null;
        }

        if (preg_match('/^(.*?)\s+(?:as\s+)?([^\s]+)$/i', $from, $matches) === 1) {
            return trim($matches[2], '`"');
        }

        $segments = explode('.', $from);
        $table = $segments[array_key_last($segments)];

        return trim($table, '`"');
    }

    /**
     * Determine whether the query already contains one of the given order columns.
     */
    private function isOrderedBy(QueryBuilder $query, string ...$columns): bool
    {
        $orders = array_merge($query->orders ?? [], $query->unionOrders ?? []);

        foreach ($orders as $order) {
            if (! is_array($order)) {
                continue;
            }

            $column = $order['column'] ?? null;

            if ($column instanceof ExpressionContract) {
                $column = $column->getValue($query->getGrammar());
            }

            if (! is_string($column)) {
                continue;
            }

            $normalizedColumn = $this->normalizeIdentifier($column);

            foreach ($columns as $orderedColumn) {
                if ($normalizedColumn === $this->normalizeIdentifier($orderedColumn)) {
                    return true;
                }
            }
        }

        return false;
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

    /**
     * The database expression a column is searched, sorted and filtered with.
     */
    private function fieldExpression(Column $column): string
    {
        $field = $column->field ?? $column->name;

        return $this->withoutAlias($field);
    }

    /**
     * The select expression that exposes the database expression of a column.
     */
    private function aliasedField(Column $column): string
    {
        $field = $column->field ?? $column->name;

        if ($this->hasAlias($field)) {
            return $field;
        }

        return $field.' as '.$column->name;
    }

    /**
     * The table every column can be selected from.
     */
    private function plainTable(mixed $from): ?string
    {
        if (! is_string($from) || $this->hasAlias($from)) {
            return null;
        }

        return $from;
    }

    private function hasAlias(string $expression): bool
    {
        return stripos($expression, ' as ') !== false;
    }

    /**
     * Remove the alias of an expression so it can be used in a constraint.
     */
    private function withoutAlias(string $expression): string
    {
        $position = stripos($expression, ' as ');

        if ($position === false) {
            return $expression;
        }

        return substr($expression, 0, $position);
    }

    /**
     * Run a custom column callback on the query builder.
     *
     * The callback works on the given builder and may return it, but the builder
     * that was handed over is always the one that is used.
     *
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @return EloquentBuilder<TQueryModel>|QueryBuilder
     */
    private function applyCallback(
        Closure $callback,
        EloquentBuilder|QueryBuilder $query,
        mixed ...$arguments,
    ): EloquentBuilder|QueryBuilder {
        $callback($query, ...$arguments);

        return $query;
    }

    /**
     * Normalize a sort direction into a value the database understands.
     *
     * @return 'asc'|'desc'
     */
    private function normalizeDirection(string $direction): string
    {
        $normalized = strtolower($direction);

        if (! in_array($normalized, ['asc', 'desc'], true)) {
            throw InvalidSortException::invalidDirection($direction);
        }

        /** @var 'asc'|'desc' $normalized */
        return $normalized;
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @return EloquentBuilder<TQueryModel>
     */
    private function eloquentQuery(EloquentBuilder|QueryBuilder $query, Column $column): EloquentBuilder
    {
        if ($query instanceof EloquentBuilder) {
            return $query;
        }

        throw InvalidColumnException::relationRequiresEloquent($column->name);
    }

    /**
     * Resolve the relationship a column reads its value from.
     *
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>  $query
     * @return Relation<Model, Model, mixed>
     */
    private function relationFor(EloquentBuilder $query, Column $column): Relation
    {
        $name = $column->relation ?? '';

        $instance = $query->getModel()->newInstance();

        if ($name === '' || ! method_exists($instance, $name)) {
            throw InvalidColumnException::unknownRelation($column->name, $name);
        }

        $method = new ReflectionMethod($instance, $name);

        if (! $method->isPublic()) {
            throw InvalidColumnException::unknownRelation($column->name, $name);
        }

        $relation = $method->invoke($instance);

        if (! $relation instanceof Relation) {
            throw InvalidColumnException::unknownRelation($column->name, $name);
        }

        return $relation;
    }

    /**
     * Describe how the related row is linked to the parent row.
     *
     * @param  Relation<Model, Model, mixed>  $relation
     * @return array{relatedTable: string, relatedColumn: string, relatedKey: string, parentTable: string, parentKey: string}
     */
    private function relationMetadata(Relation $relation, Column $column): array
    {
        $parent = $relation->getParent();
        $related = $relation->getRelated();

        if ($relation instanceof BelongsTo) {
            return [
                'relatedTable' => $related->getTable(),
                'relatedColumn' => $column->relationColumn ?? $relation->getOwnerKeyName(),
                'relatedKey' => $relation->getOwnerKeyName(),
                'parentTable' => $parent->getTable(),
                'parentKey' => $relation->getForeignKeyName(),
            ];
        }

        if ($relation instanceof HasOne) {
            return [
                'relatedTable' => $related->getTable(),
                'relatedColumn' => $column->relationColumn ?? $related->getKeyName(),
                'relatedKey' => $relation->getForeignKeyName(),
                'parentTable' => $parent->getTable(),
                'parentKey' => $relation->getLocalKeyName(),
            ];
        }

        throw InvalidColumnException::unsupportedRelation($column->name, $column->relation ?? '');
    }

    /**
     * The relationship a column reads its value from.
     */
    private function relationName(Column $column): string
    {
        $relation = $column->relation;

        if ($relation === null) {
            throw InvalidColumnException::unknownRelation($column->name, '');
        }

        return $relation;
    }

    /**
     * Compute the values that are not read from a plain database attribute.
     *
     * @param  array<array-key, TModel>  $items
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return array<int, array<string, mixed>>
     */
    private function computeColumnValues(array $items, EloquentBuilder|QueryBuilder $query): array
    {
        $columns = array_values(array_filter(
            $this->columns,
            fn (Column $column): bool => $column->value instanceof Closure || $column->relation !== null,
        ));

        if ($columns === []) {
            return [];
        }

        $relatedColumns = [];

        foreach ($columns as $column) {
            if ($column->value !== null || $column->relation === null) {
                continue;
            }

            $eloquent = $this->eloquentQuery($query, $column);
            $relation = $this->relationFor($eloquent, $column);

            $relatedColumns[$column->name] = $this->relationMetadata($relation, $column)['relatedColumn'];
        }

        $values = [];

        foreach (array_values($items) as $index => $row) {
            $rowValues = [];

            foreach ($columns as $column) {
                $rowValues[$column->name] = $this->resolveColumnValue($column, $row, $relatedColumns[$column->name] ?? null);
            }

            $values[$index] = $rowValues;
        }

        return $values;
    }

    /**
     * Resolve the value a column exposes for the given row.
     */
    private function resolveColumnValue(Column $column, object $row, ?string $relatedColumn): mixed
    {
        if ($column->value instanceof Closure) {
            return ($column->value)($row);
        }

        $relation = $column->relation;

        if ($relation === null || $relatedColumn === null || ! $row instanceof Model) {
            return null;
        }

        if (! $row->relationLoaded($relation)) {
            return null;
        }

        $related = $row->getRelationValue($relation);

        if (! $related instanceof Model) {
            return null;
        }

        return $related->getAttribute($relatedColumn);
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

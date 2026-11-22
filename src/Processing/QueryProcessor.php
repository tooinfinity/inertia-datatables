<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\DataTableResult;
use TooInfinity\InertiaDataTables\Processing\Applicators\FilterApplier;
use TooInfinity\InertiaDataTables\Processing\Applicators\SearchApplier;
use TooInfinity\InertiaDataTables\Processing\Applicators\SortApplier;
use TooInfinity\InertiaDataTables\QueryConfig;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;

/**
 * Orchestrates query processing: columns, eager loads, filters, searches, sorts, and pagination.
 *
 * @template TModel of Model
 */
final readonly class QueryProcessor
{
    private ColumnRegistry $registry;

    private RelationResolver $relations;

    private FilterApplier $filterApplier;

    private SearchApplier $searchApplier;

    private SortApplier $sortApplier;

    private ValueComputer $valueComputer;

    /**
     * @param  array<int, Column>  $columns
     */
    public function __construct(
        private array $columns,
        private bool $exposeAll = false,
        private ?string $responseKey = null,
        ?ColumnRegistry $registry = null,
        ?RelationResolver $relations = null,
        ?FilterApplier $filterApplier = null,
        ?SearchApplier $searchApplier = null,
        ?SortApplier $sortApplier = null,
        ?ValueComputer $valueComputer = null,
    ) {
        $this->registry = $registry ?? new ColumnRegistry($this->columns);
        $this->relations = $relations ?? new RelationResolver;
        $this->searchApplier = $searchApplier ?? new SearchApplier($this->registry, $this->relations);
        $this->filterApplier = $filterApplier ?? new FilterApplier($this->registry, $this->relations, $this->searchApplier);

        if (! $sortApplier instanceof SortApplier) {
            /** @var TableColumns $tableColumns */
            $tableColumns = app(TableColumns::class);
            $stableOrdering = new StableOrdering(new Projection, $tableColumns);
            $this->sortApplier = new SortApplier($this->registry, $this->relations, $stableOrdering);
        } else {
            $this->sortApplier = $sortApplier;
        }

        $this->valueComputer = $valueComputer ?? new ValueComputer($this->registry, $this->relations);
    }

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
        $this->registry->validateRequest($request);

        $this->registry->applyColumnFields($query);
        $this->relations->applyRelationLoads($query, $this->columns);

        $this->filterApplier->apply($query, $request);
        $this->searchApplier->applyGlobal($query, $request);
        $this->searchApplier->applyColumns($query, $request);

        $isDefaultSort = $request->sorts->isEmpty() && $defaultSortColumn !== null;
        $sorts = $this->sortApplier->resolveSorts($request, $defaultSortColumn, $defaultSortDirection);
        $this->sortApplier->apply($query, $sorts, $isDefaultSort);

        /** @var int $maxPerPage */
        $maxPerPage = config('inertia-datatables.max_per_page', 100);
        $perPage = $this->resolvePerPage($request, $perPageOverride, $maxPerPage);

        // Clamp the page using the final effective page size so the pagination
        // offset (page - 1) * perPage cannot overflow PHP integer arithmetic.
        // The bound is calculated after the table-level perPage override and
        // max_per_page are resolved, so the paginator always receives a page
        // whose offset fits in a signed integer.
        $maxPage = intdiv(PHP_INT_MAX, max(1, $perPage));
        $page = min($maxPage, max(1, $request->page));

        $paginator = $query->paginate($perPage, page: $page);

        /** @var \Illuminate\Contracts\Pagination\LengthAwarePaginator<array-key, TModel> $paginator */
        return new DataTableResult(
            paginator: $paginator,
            columns: array_map(fn (Column $column): array => $column->toArray(), $this->columns),
            query: $this->buildQueryState($request, $page, $perPage, $sorts),
            config: $this->buildConfig($perPage, $maxPerPage),
            exposeAll: $this->exposeAll,
            responseKey: $this->responseKey,
            computedValues: $this->valueComputer->compute($paginator->items(), $query),
        );
    }

    /**
     * @return array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>}
     */
    private function buildQueryState(DataTableRequest $request, int $page, int $perPage, SortCollection $sorts): array
    {
        $queryState = $request->toArray();
        $queryState['page'] = $page;
        $queryState['per_page'] = $perPage;
        $queryState['sort'] = $sorts->toArray();

        return $queryState;
    }

    /**
     * @return array{debounce: int, per_page_options: array<int, int>, query_keys: array{page: string, per_page: string, search: string, searches: string, sort: string, filters: string}}
     */
    private function buildConfig(int $perPage, int $maxPerPage): array
    {
        /** @var int $debounce */
        $debounce = config('inertia-datatables.search.debounce', 300);

        return [
            'debounce' => $debounce,
            'per_page_options' => $this->resolvePerPageOptions($perPage, $maxPerPage),
            'query_keys' => QueryConfig::fromConfig()->toQueryKeys(),
        ];
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

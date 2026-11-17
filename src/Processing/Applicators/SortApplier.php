<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing\Applicators;

use Closure;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
use TooInfinity\InertiaDataTables\Processing\ColumnRegistry;
use TooInfinity\InertiaDataTables\Processing\RelationResolver;
use TooInfinity\InertiaDataTables\Processing\StableOrdering;
use TooInfinity\InertiaDataTables\Sorting\Sort;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;

/**
 * Applies sorting constraints and tiebreakers to database queries.
 *
 * @internal
 */
final readonly class SortApplier
{
    public function __construct(
        private ColumnRegistry $registry,
        private RelationResolver $relations,
        private StableOrdering $stableOrdering,
    ) {}

    /**
     * Resolve the active sort collection from the request or fallback defaults.
     */
    public function resolveSorts(
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
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    public function apply(
        EloquentBuilder|QueryBuilder $query,
        SortCollection $sorts,
        bool $isDefault = false,
    ): void {
        foreach ($sorts->all() as $sort) {
            $column = $this->registry->find($sort->column);

            if (! $isDefault && ! $column->sortable) {
                throw InvalidSortException::notAllowed($sort->column)->forRequest();
            }

            $direction = $this->normalizeDirection($sort->direction, forRequest: ! $isDefault);

            $this->applySortToColumn($query, $column, $direction);
        }

        $this->stableOrdering->apply($query);
    }

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'asc'|'desc'  $direction
     */
    public function applySortToColumn(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $direction,
    ): void {
        if ($column->sortUsing instanceof Closure) {
            ($column->sortUsing)($query, $direction);

            return;
        }

        if ($column->relation !== null) {
            $this->applyRelationSort($query, $column, $direction);

            return;
        }

        $query->orderBy($this->registry->fieldExpression($column), $direction);
    }

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'asc'|'desc'  $direction
     */
    public function applyRelationSort(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $direction,
    ): void {
        $resolved = $this->relations->resolve($query, $column);
        $link = $resolved['link'];

        $subquery = $resolved['relation']->getQuery();

        $queryBuilder = $query instanceof EloquentBuilder ? $query->getQuery() : $query;
        $outerQualifier = $this->registry->tableQualifier($queryBuilder->from) ?? $link->parentTable;

        if ($link->relatedTable === $link->parentTable) {
            $alias = $link->relatedTable.'_sort_related';
            $subquery->from($link->relatedTable.' as '.$alias)
                ->select($alias.'.'.$link->relatedColumn)
                ->whereColumn(
                    $alias.'.'.$link->relatedKey,
                    $outerQualifier.'.'.$link->parentKey,
                );
        } else {
            $subquery->select($link->relatedTable.'.'.$link->relatedColumn)
                ->whereColumn(
                    $link->relatedTable.'.'.$link->relatedKey,
                    $outerQualifier.'.'.$link->parentKey,
                );
        }

        $subquery->limit(1);

        $resolved['eloquent']->orderBy($subquery, $direction);
    }

    /**
     * Normalize a sort direction into a value the database understands.
     *
     * @return 'asc'|'desc'
     */
    public function normalizeDirection(string $direction, bool $forRequest = false): string
    {
        $normalized = strtolower($direction);

        if (! in_array($normalized, ['asc', 'desc'], true)) {
            $exception = InvalidSortException::invalidDirection($direction);

            throw $forRequest ? $exception->forRequest() : $exception;
        }

        /** @var 'asc'|'desc' $normalized */
        return $normalized;
    }
}

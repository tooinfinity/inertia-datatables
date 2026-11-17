<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing\Applicators;

use Closure;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Processing\ColumnRegistry;
use TooInfinity\InertiaDataTables\Processing\RelationResolver;

/**
 * Applies request filters to database queries.
 *
 * @internal
 */
final readonly class FilterApplier
{
    public function __construct(
        private ColumnRegistry $registry,
        private RelationResolver $relations,
        private SearchApplier $searchApplier,
    ) {}

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    public function apply(EloquentBuilder|QueryBuilder $query, DataTableRequest $request): void
    {
        foreach ($request->filters->all() as $filter) {
            $column = $this->registry->find($filter->column);

            if (! $column->filterable) {
                throw InvalidFilterException::notAllowed($filter->column)->forRequest();
            }

            $this->applyFilter($query, $column, $filter->value);
        }
    }

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    public function applyFilter(EloquentBuilder|QueryBuilder $query, Column $column, mixed $value): void
    {
        if ($column->filterUsing instanceof Closure) {
            ($column->filterUsing)($query, $value);

            return;
        }

        if ($column->relation !== null) {
            $this->applyRelationFilter($query, $column, $value);

            return;
        }

        $this->applyFilterToColumn($query, $column, $this->registry->fieldExpression($column), $value);
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     */
    public function applyFilterToColumn(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $target,
        mixed $value,
    ): void {
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
                $query->whereRaw('1 = 0');

                return;
            }

            $query->whereIn($target, $value);

            return;
        }

        // Handle boolean string values ("true"/"false"/"1"/"0") for any filterable column
        if (is_string($value)) {
            $lowerValue = strtolower($value);
            if (in_array($lowerValue, ['true', '1'], true)) {
                $query->where($target, true);

                return;
            }
            if (in_array($lowerValue, ['false', '0'], true)) {
                $query->where($target, false);

                return;
            }
        }

        if (is_bool($value)) {
            $query->where($target, $value);

            return;
        }

        if ($value === 'null' || $value === 'NULL') {
            $query->whereNull($target);

            return;
        }

        if ($value === 'not_null' || $value === 'NOT_NULL') {
            $query->whereNotNull($target);

            return;
        }

        if (is_string($value) && str_contains($value, '*')) {
            $pattern = $this->searchApplier->escapeLikeValue($value, allowWildcards: true);

            $this->searchApplier->applyLike($query, $target, $pattern);

            return;
        }

        $query->where($target, $value);
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     */
    public function applyRelationFilter(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        mixed $value,
    ): void {
        $resolved = $this->relations->resolve($query, $column);

        $resolved['eloquent']->has($this->relations->relationName($column), '>=', 1, 'and', function (EloquentBuilder $related) use ($column, $resolved, $value): void {
            $this->applyFilterToColumn($related, $column, $resolved['link']->relatedColumn, $value);
        });
    }
}

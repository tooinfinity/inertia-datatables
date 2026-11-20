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
                $canonicalValues = [];
                foreach ($value as $item) {
                    $canonical = $this->resolveSelectValue($item, $column->filterOptions);
                    if ($canonical === null) {
                        $itemString = is_string($item) ? $item : json_encode($item);
                        throw InvalidFilterException::invalidValue($column->name, "Value '{$itemString}' is not in allowed options")->forRequest();
                    }
                    $canonicalValues[] = $canonical;
                }
                $value = $canonicalValues;
            }

            // Empty array means no results
            if ($value === []) {
                $query->whereRaw('1 = 0');

                return;
            }

            $query->whereIn($target, $value);

            return;
        }

        // Validate select membership before the generic operator branches so
        // disallowed scalar values (e.g. "*", "true", "null", "not_null")
        // produce a validation error instead of a query constraint.
        if (
            $column->filterType === 'select'
            && $column->filterOptions !== []
            && is_scalar($value)
        ) {
            $canonical = $this->resolveSelectValue($value, $column->filterOptions);

            if ($canonical === null) {
                throw InvalidFilterException::invalidValue($column->name, $value)->forRequest();
            }

            $value = $canonical;
        }

        // Handle boolean string values ("true"/"false"/"1"/"0") only for columns
        // that explicitly opt in with filterType('boolean'). For every other
        // column these are ordinary literal string values, so a string column can
        // still match the exact values "0", "1", "true" and "false".
        if (is_string($value) && $column->filterType === 'boolean') {
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

    /**
     * Resolve a submitted filter value against the allowed select options'
     * wire representations, returning the canonical option value when a match
     * is found (e.g. the string `"2"` matches the integer option `2`).
     *
     * @param  array<int, array{value: int|string, label: string}>  $options
     * @return mixed|null The canonical option value, or null when no match exists.
     */
    private function resolveSelectValue(mixed $value, array $options): mixed
    {
        $allowedValues = array_column($options, 'value');

        if (in_array($value, $allowedValues, true)) {
            return $value;
        }

        foreach ($allowedValues as $allowed) {
            $allowedString = (string) $allowed;

            if (is_string($value) && $value === $allowedString) {
                return $allowed;
            }

            if (is_int($value) || is_float($value)) {
                if ((string) $value === $allowedString) {
                    return $allowed;
                }
            }
        }

        return null;
    }
}

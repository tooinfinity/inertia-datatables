<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Closure;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use TooInfinity\InertiaDataTables\Column;

/**
 * Computes custom and relationship-based column values for paginated rows.
 *
 * @internal
 */
final readonly class ValueComputer
{
    public function __construct(
        private ColumnRegistry $registry,
        private RelationResolver $relations,
    ) {}

    /**
     * Compute the values that are not read from a plain database attribute.
     *
     * @template TModel of Model
     *
     * @param  array<array-key, TModel>  $items
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return array<int, array<string, mixed>>
     */
    public function compute(array $items, EloquentBuilder|QueryBuilder $query): array
    {
        $columns = array_values(array_filter(
            $this->registry->all(),
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

            $resolved = $this->relations->resolve($query, $column);
            $relatedColumns[$column->name] = $resolved['link']->relatedColumn;
        }

        $values = [];

        foreach (array_values($items) as $index => $row) {
            $rowValues = [];

            foreach ($columns as $column) {
                $rowValues[$column->name] = $this->resolveValue($column, $row, $relatedColumns[$column->name] ?? null);
            }

            $values[$index] = $rowValues;
        }

        return $values;
    }

    /**
     * Resolve the value a column exposes for the given row.
     */
    public function resolveValue(Column $column, object $row, ?string $relatedColumn): mixed
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
}

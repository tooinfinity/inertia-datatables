<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use BackedEnum;
use Closure;
use InvalidArgumentException;
use JsonSerializable;
use ReflectionEnum;

final readonly class Column implements JsonSerializable
{
    /**
     * @param  array<int, array{value: string, label: string}>  $filterOptions
     * @param  Closure|null  $searchUsing  Receives the query builder, the search term and the boolean operator.
     * @param  Closure|null  $sortUsing  Receives the query builder and the sort direction.
     * @param  Closure|null  $filterUsing  Receives the query builder and the filter value.
     * @param  Closure|null  $value  Receives the row and returns the value exposed for this column.
     */
    public function __construct(
        public string $name,
        public string $label,
        public bool $searchable = false,
        public bool $sortable = false,
        public bool $filterable = false,
        public bool $hidden = false,
        public ?string $filterType = null,
        /** @var array<int, array{value: int|string, label: string}> */
        public array $filterOptions = [],
        public ?string $field = null,
        public ?string $relation = null,
        public ?string $relationColumn = null,
        public ?Closure $searchUsing = null,
        public ?Closure $sortUsing = null,
        public ?Closure $filterUsing = null,
        public ?Closure $value = null,
    ) {}

    public static function make(string $name): self
    {
        return new self(
            name: $name,
            label: self::formatLabel($name),
        );
    }

    public function label(string $label): self
    {
        return $this->with(['label' => $label]);
    }

    public function searchable(bool $value = true): self
    {
        return $this->with(['searchable' => $value]);
    }

    public function sortable(bool $value = true): self
    {
        return $this->with(['sortable' => $value]);
    }

    public function filterable(bool $value = true): self
    {
        return $this->with(['filterable' => $value]);
    }

    public function filterType(string $type): self
    {
        return $this->with(['filterType' => $type]);
    }

    /**
     * @param  array<int, array{value: string, label: string}>  $options
     */
    public function filterOptions(array $options): self
    {
        return $this->with([
            'filterType' => $this->filterType ?? 'select',
            'filterOptions' => $options,
        ]);
    }

    /**
     * Derive select filter options from a PHP {@see BackedEnum}.
     *
     * Each case's actual backed value (string or integer) is used as the
     * filter value. A human-readable default label is derived from the case
     * name. Labels can be overridden with a backed value => label map, or a
     * label resolver closure receiving the enum case and returning a label
     * (or null to fall back to the map and then the default label).
     *
     * Pure {@see \UnitEnum} cases are rejected because they do not have scalar
     * values suitable for database filters.
     *
     * @param  class-string<BackedEnum>  $enumClass  A backed enum class.
     * @param  array<int|string, string>|null  $labels  Optional backed value => label overrides.
     * @param  Closure(BackedEnum): string|null|null  $labelResolver  Optional label resolver.
     *
     * @throws InvalidArgumentException When the class does not exist or is not a backed enum.
     */
    public function filterEnum(string $enumClass, ?array $labels = null, ?Closure $labelResolver = null): self
    {
        if (! enum_exists($enumClass)) {
            throw new InvalidArgumentException("Class [{$enumClass}] does not exist.");
        }

        $reflection = new ReflectionEnum($enumClass);

        if (! $reflection->isBacked()) {
            throw new InvalidArgumentException("Class [{$enumClass}] is not a backed enum.");
        }

        $options = [];

        foreach ($reflection->getConstants() as $case) {
            /** @var BackedEnum $case */
            $label = $labelResolver ? ($labelResolver)($case) : null;
            $label ??= $labels[$case->value] ?? null;
            $label ??= $this->defaultLabel($case->name);

            $options[] = [
                'value' => $case->value,
                'label' => $label,
            ];
        }

        return $this->with([
            'filterType' => 'select',
            'filterOptions' => $options,
        ]);
    }

    public function hidden(bool $value = true): self
    {
        return $this->with(['hidden' => $value]);
    }

    /**
     * Use a different database expression than the response key.
     *
     * The expression is used when searching, sorting and filtering the column and
     * is selected for you, so the value is exposed under the column name.
     */
    public function field(string $field): self
    {
        return $this->with(['field' => $field]);
    }

    /**
     * Read the column value from an Eloquent relationship.
     *
     * The relationship is searched with `whereHas()`, sorted with a correlated
     * subquery and its attribute is exposed under the column name.
     */
    public function relation(string $relation, ?string $column = null): self
    {
        return $this->with([
            'relation' => $relation,
            'relationColumn' => $column,
        ]);
    }

    /**
     * Search the column with a custom query callback.
     *
     * The callback receives the query builder, the search term and the boolean
     * operator that has to be applied to the constraint.
     */
    public function searchUsing(Closure $callback): self
    {
        return $this->with(['searchUsing' => $callback]);
    }

    /**
     * Sort the column with a custom query callback.
     *
     * The callback receives the query builder and the sort direction.
     */
    public function sortUsing(Closure $callback): self
    {
        return $this->with(['sortUsing' => $callback]);
    }

    /**
     * Filter the column with a custom query callback.
     *
     * The callback receives the query builder and the filter value.
     */
    public function filterUsing(Closure $callback): self
    {
        return $this->with(['filterUsing' => $callback]);
    }

    /**
     * Compute the value exposed for this column from the row.
     *
     * The callback receives the row and returns the value that is added to the
     * response under the column name.
     */
    public function value(Closure $callback): self
    {
        return $this->with(['value' => $callback]);
    }

    /**
     * @return array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: int|string, label: string}>}
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'label' => $this->label,
            'searchable' => $this->searchable,
            'sortable' => $this->sortable,
            'filterable' => $this->filterable,
            'hidden' => $this->hidden,
            'filter_type' => $this->filterType,
            'filter_options' => $this->filterOptions,
        ];
    }

    /**
     * @return array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: int|string, label: string}>}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }

    private static function formatLabel(string $name): string
    {
        return ucwords(str_replace(['_', '.'], ' ', $name));
    }

    /**
     * Derive a human-readable default label from an enum case name.
     *
     * @param  string  $name  The enum case name (e.g. `IN_REVIEW`).
     * @return string The default label (e.g. `In Review`).
     */
    private function defaultLabel(string $name): string
    {
        return ucwords(strtolower(str_replace(['_', '-'], ' ', $name)));
    }

    /**
     * Create a copy of the column with the given properties replaced.
     *
     * @param  array{
     *     name?: string,
     *     label?: string,
     *     searchable?: bool,
     *     sortable?: bool,
     *     filterable?: bool,
     *     hidden?: bool,
     *     filterType?: string|null,
     *     filterOptions?: array<int, array{value: int|string, label: string}>,
     *     field?: string|null,
     *     relation?: string|null,
     *     relationColumn?: string|null,
     *     searchUsing?: Closure|null,
     *     sortUsing?: Closure|null,
     *     filterUsing?: Closure|null,
     *     value?: Closure|null,
     * }  $changes
     */
    private function with(array $changes): self
    {
        return new self(
            name: $changes['name'] ?? $this->name,
            label: $changes['label'] ?? $this->label,
            searchable: $changes['searchable'] ?? $this->searchable,
            sortable: $changes['sortable'] ?? $this->sortable,
            filterable: $changes['filterable'] ?? $this->filterable,
            hidden: $changes['hidden'] ?? $this->hidden,
            filterType: $changes['filterType'] ?? $this->filterType,
            filterOptions: $changes['filterOptions'] ?? $this->filterOptions,
            field: $changes['field'] ?? $this->field,
            relation: $changes['relation'] ?? $this->relation,
            relationColumn: $changes['relationColumn'] ?? $this->relationColumn,
            searchUsing: $changes['searchUsing'] ?? $this->searchUsing,
            sortUsing: $changes['sortUsing'] ?? $this->sortUsing,
            filterUsing: $changes['filterUsing'] ?? $this->filterUsing,
            value: $changes['value'] ?? $this->value,
        );
    }
}

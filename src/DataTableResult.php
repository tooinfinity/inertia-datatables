<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Database\Eloquent\Model;
use JsonSerializable;

/**
 * @template T of object
 *
 * @implements Arrayable<string, mixed>
 */
final readonly class DataTableResult implements Arrayable, JsonSerializable
{
    /** @var array<int, T> */
    private array $data;

    /**
     * @param  LengthAwarePaginator<array-key, T>  $paginator
     * @param  array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: int|string, label: string}>}>  $columns
     * @param  array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>}  $query
     * @param  array{debounce: int, per_page_options: array<int, int>, query_keys: array{page: string, per_page: string, search: string, searches: string, sort: string, filters: string}}  $config
     * @param  array<int, array<string, mixed>>  $computedValues
     * @param  array<int, string>  $responseKeys
     */
    public function __construct(
        public LengthAwarePaginator $paginator,
        public array $columns,
        public array $query,
        public array $config,
        private bool $exposeAll = false,
        private array $responseKeys = [],
        private array $computedValues = [],
    ) {
        $this->data = $this->projectData();
    }

    /**
     * @return array{
     *     data: array<int, T>,
     *     meta: array{current_page: int, per_page: int, from: int|null, to: int|null, total: int, last_page: int},
     *     query: array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>},
     *     columns: array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: int|string, label: string}>}>,
     *     config: array{debounce: int, per_page_options: array<int, int>, query_keys: array{page: string, per_page: string, search: string, searches: string, sort: string, filters: string}}
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            'data' => $this->data,
            'meta' => [
                'current_page' => $this->paginator->currentPage(),
                'per_page' => $this->paginator->perPage(),
                'from' => $this->paginator->firstItem(),
                'to' => $this->paginator->lastItem(),
                'total' => $this->paginator->total(),
                'last_page' => $this->paginator->lastPage(),
            ],
            'query' => $this->query,
            'columns' => $this->columns,
            'config' => $this->config,
        ];
    }

    /**
     * @return array{
     *     data: array<int, T>,
     *     meta: array{current_page: int, per_page: int, from: int|null, to: int|null, total: int, last_page: int},
     *     query: array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>},
     *     columns: array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: int|string, label: string}>}>,
     *     config: array{debounce: int, per_page_options: array<int, int>, query_keys: array{page: string, per_page: string, search: string, searches: string, sort: string, filters: string}}
     * }
     */
    public function toArray(): array
    {
        return $this->jsonSerialize();
    }

    /**
     * @return array<int, T>
     */
    private function projectData(): array
    {
        /** @var array<int, T> $items */
        $items = array_values($this->paginator->items());

        /** @var array<int, string> $responseColumns */
        $responseColumns = array_column($this->columns, 'name');

        $responseColumns = array_merge($responseColumns, $this->responseKeys);

        $responseColumns = array_values(array_unique($responseColumns));

        $data = [];

        foreach ($items as $index => $item) {
            $row = $this->exposeAll ? $item : $this->projectRow($item, $responseColumns);

            $computed = $this->computedValues[$index] ?? [];

            if ($computed !== []) {
                $row = $this->applyComputedValues($row, $computed);
            }

            $data[] = $row;
        }

        return $data;
    }

    /**
     * @param  T  $row
     * @param  array<string, mixed>  $computed
     * @return T
     */
    private function applyComputedValues(object $row, array $computed): object
    {
        if ($row instanceof Model) {
            $model = clone $row;
            $model->setRawAttributes(array_merge($model->getAttributes(), $computed));

            return $model;
        }

        $projected = clone $row;

        foreach ($computed as $attribute => $value) {
            $projected->{$attribute} = $value;
        }

        return $projected;
    }

    /**
     * @param  T  $row
     * @param  array<int, string>  $responseColumns
     * @return T
     */
    private function projectRow(object $row, array $responseColumns): object
    {
        if ($row instanceof Model) {
            $model = clone $row;

            // Response keys that resolve to Eloquent accessors need their source
            // attributes available during serialization, because Eloquent
            // re-evaluates accessors when converting the model to an array.
            // Those source attributes stay in the raw attributes but are hidden
            // from output, along with every other non-declared attribute.
            $accessorKeys = [];
            foreach ($responseColumns as $key) {
                if (! array_key_exists($key, $model->getAttributes())
                    && ($model->hasGetMutator($key) || $model->hasAttributeGetMutator($key))
                ) {
                    $accessorKeys[] = $key;
                }
            }

            $hidden = array_values(array_unique(array_merge(
                $model->getHidden(),
                array_diff(array_keys($model->getAttributes()), $responseColumns),
            )));
            $model->setHidden($hidden);

            $appends = array_values(array_unique(array_merge(
                array_intersect($model->getAppends(), $responseColumns),
                $accessorKeys,
            )));
            $model->setAppends($appends);

            $model->unsetRelations();

            return $model;
        }

        $projected = clone $row;

        foreach (array_keys(get_object_vars($projected)) as $attribute) {
            if (! in_array($attribute, $responseColumns, true)) {
                unset($projected->{$attribute});
            }
        }

        return $projected;
    }
}

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
     * @param  array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: string, label: string}>}>  $columns
     * @param  array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>}  $query
     * @param  array{debounce: int, per_page_options: array<int, int>}  $config
     */
    public function __construct(
        public LengthAwarePaginator $paginator,
        public array $columns,
        public array $query,
        public array $config,
        private bool $exposeAll = false,
        private ?string $responseKey = null,
    ) {
        $this->data = $this->projectData();
    }

    /**
     * @return array{
     *     data: array<int, T>,
     *     meta: array{current_page: int, per_page: int, from: int|null, to: int|null, total: int, last_page: int},
     *     query: array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>},
     *     columns: array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: string, label: string}>}>,
     *     config: array{debounce: int, per_page_options: array<int, int>}
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
     *     columns: array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool, filter_type: string|null, filter_options: array<int, array{value: string, label: string}>}>,
     *     config: array{debounce: int, per_page_options: array<int, int>}
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

        if ($this->exposeAll) {
            return $items;
        }

        /** @var array<int, string> $responseColumns */
        $responseColumns = array_column($this->columns, 'name');

        if ($this->responseKey !== null) {
            $responseColumns[] = $this->responseKey;
        }

        $responseColumns = array_values(array_unique($responseColumns));

        return array_map(
            fn (object $row): object => $this->projectRow($row, $responseColumns),
            $items,
        );
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
            $model->setRawAttributes(array_intersect_key(
                $model->getAttributes(),
                array_flip($responseColumns),
            ));
            $model->setAppends(array_values(array_intersect(
                $model->getAppends(),
                $responseColumns,
            )));
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

<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * @template T
 */
final readonly class DataTableResult
{
    /**
     * @param  LengthAwarePaginator<array-key, T>  $paginator
     * @param  array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool}>  $columns
     * @param  array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>}  $query
     */
    public function __construct(
        public LengthAwarePaginator $paginator,
        public array $columns,
        public array $query,
    ) {}

    /**
     * @return array{
     *     data: array<int, T>,
     *     meta: array{current_page: int, per_page: int, from: int|null, to: int|null, total: int, last_page: int},
     *     query: array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>},
     *     columns: array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool}>
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            'data' => array_values($this->paginator->items()),
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
        ];
    }

    /**
     * @return array{
     *     data: array<int, T>,
     *     meta: array{current_page: int, per_page: int, from: int|null, to: int|null, total: int, last_page: int},
     *     query: array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>},
     *     columns: array<int, array{name: string, label: string, searchable: bool, sortable: bool, filterable: bool, hidden: bool}>
     * }
     */
    public function toArray(): array
    {
        return $this->jsonSerialize();
    }
}

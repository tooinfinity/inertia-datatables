<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use InvalidArgumentException;

final readonly class QueryConfig
{
    public function __construct(
        public string $page = 'page',
        public string $perPage = 'per_page',
        public string $search = 'search',
        public string $searches = 'searches',
        public string $sort = 'sort',
        public string $filters = 'filters',
        public int $maxSearchLength = 500,
        public int $maxFilterValueLength = 500,
        public int $maxSorts = 10,
        public int $maxFilters = 20,
        public int $maxSearches = 20,
    ) {}

    public static function fromConfig(): self
    {
        /** @var array{page: string, per_page: string, search: string, searches: string, sort: string, filters: string} $queryConfig */
        $queryConfig = config('inertia-datatables.query', [
            'page' => 'page',
            'per_page' => 'per_page',
            'search' => 'search',
            'searches' => 'searches',
            'sort' => 'sort',
            'filters' => 'filters',
        ]);

        /** @var array{max_search_length: int, max_filter_value_length: int, max_sorts: int, max_filters: int, max_searches: int} $validationConfig */
        $validationConfig = config('inertia-datatables.validation', [
            'max_search_length' => 500,
            'max_filter_value_length' => 500,
            'max_sorts' => 10,
            'max_filters' => 20,
            'max_searches' => 20,
        ]);

        self::validateConfig($queryConfig, $validationConfig);

        return new self(
            page: $queryConfig['page'],
            perPage: $queryConfig['per_page'],
            search: $queryConfig['search'],
            searches: $queryConfig['searches'],
            sort: $queryConfig['sort'],
            filters: $queryConfig['filters'],
            maxSearchLength: $validationConfig['max_search_length'],
            maxFilterValueLength: $validationConfig['max_filter_value_length'],
            maxSorts: $validationConfig['max_sorts'],
            maxFilters: $validationConfig['max_filters'],
            maxSearches: $validationConfig['max_searches'],
        );
    }

    /**
     * @return array{page: string, per_page: string, search: string, searches: string, sort: string, filters: string, max_search_length: int, max_filter_value_length: int, max_sorts: int, max_filters: int, max_searches: int}
     */
    public function toArray(): array
    {
        return [
            'page' => $this->page,
            'per_page' => $this->perPage,
            'search' => $this->search,
            'searches' => $this->searches,
            'sort' => $this->sort,
            'filters' => $this->filters,
            'max_search_length' => $this->maxSearchLength,
            'max_filter_value_length' => $this->maxFilterValueLength,
            'max_sorts' => $this->maxSorts,
            'max_filters' => $this->maxFilters,
            'max_searches' => $this->maxSearches,
        ];
    }

    /**
     * @param  array<string, string>  $queryConfig
     * @param  array{max_search_length: int, max_filter_value_length: int, max_sorts: int, max_filters: int, max_searches: int}  $validationConfig
     */
    private static function validateConfig(array $queryConfig, array $validationConfig): void
    {
        foreach ($queryConfig as $key => $value) {
            if ($value === '') {
                throw new InvalidArgumentException("Query config '{$key}' must be a non-empty string.");
            }
        }

        if ($validationConfig['max_search_length'] < 1) {
            throw new InvalidArgumentException('Validation config max_search_length must be >= 1.');
        }

        if ($validationConfig['max_filter_value_length'] < 1) {
            throw new InvalidArgumentException('Validation config max_filter_value_length must be >= 1.');
        }

        if ($validationConfig['max_sorts'] < 1) {
            throw new InvalidArgumentException('Validation config max_sorts must be >= 1.');
        }

        if ($validationConfig['max_filters'] < 1) {
            throw new InvalidArgumentException('Validation config max_filters must be >= 1.');
        }

        if ($validationConfig['max_searches'] < 1) {
            throw new InvalidArgumentException('Validation config max_searches must be >= 1.');
        }
    }
}

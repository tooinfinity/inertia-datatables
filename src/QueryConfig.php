<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

final readonly class QueryConfig
{
    public function __construct(
        public string $page = 'page',
        public string $perPage = 'per_page',
        public string $search = 'search',
        public string $searches = 'searches',
        public string $sort = 'sort',
        public string $filters = 'filters',
    ) {}

    public static function fromConfig(): self
    {
        /** @var array{page: string, per_page: string, search: string, searches: string, sort: string, filters: string} $config */
        $config = config('inertia-datatables.query', [
            'page' => 'page',
            'per_page' => 'per_page',
            'search' => 'search',
            'searches' => 'searches',
            'sort' => 'sort',
            'filters' => 'filters',
        ]);

        return new self(
            page: $config['page'],
            perPage: $config['per_page'],
            search: $config['search'],
            searches: $config['searches'],
            sort: $config['sort'],
            filters: $config['filters'],
        );
    }

    /**
     * @return array{page: string, per_page: string, search: string, searches: string, sort: string, filters: string}
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
        ];
    }
}

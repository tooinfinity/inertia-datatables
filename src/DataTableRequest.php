<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Http\Request;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;

final readonly class DataTableRequest
{
    public function __construct(
        public int $page,
        public int $perPage,
        public string $search,
        public SortCollection $sorts,
        public SearchCollection $searches,
        public FilterCollection $filters,
    ) {}

    /**
     * @param  array{page: string, per_page: string, search: string, sort: string, filters: string}  $queryConfig
     */
    public static function fromRequest(Request $request, array $queryConfig): self
    {
        $page = max(1, (int) $request->query($queryConfig['page'], 1));
        $perPage = (int) $request->query($queryConfig['per_page'], config('inertia-datatables.default_per_page', 25));
        $search = (string) $request->query($queryConfig['search'], '');

        $sorts = SortCollection::fromQueryString(
            (string) $request->query($queryConfig['sort'], ''),
        );

        $searches = SearchCollection::fromRequest($request, $queryConfig['search']);

        $filters = FilterCollection::fromRequest($request, $queryConfig['filters']);

        return new self(
            page: $page,
            perPage: $perPage,
            search: $search,
            sorts: $sorts,
            searches: $searches,
            filters: $filters,
        );
    }

    /**
     * @return array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>}
     */
    public function toArray(): array
    {
        return [
            'page' => $this->page,
            'per_page' => $this->perPage,
            'search' => $this->search,
            'sort' => $this->sorts->toArray(),
            'searches' => $this->searches->toArray(),
            'filters' => $this->filters->toArray(),
        ];
    }

    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}

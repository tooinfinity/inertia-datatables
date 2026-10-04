<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Http\Request;
use JsonSerializable;
use TooInfinity\InertiaDataTables\Filtering\FilterCollection;
use TooInfinity\InertiaDataTables\Searching\SearchCollection;
use TooInfinity\InertiaDataTables\Sorting\SortCollection;

final readonly class DataTableRequest implements JsonSerializable
{
    public function __construct(
        public int $page,
        public int $perPage,
        public string $search,
        public SortCollection $sorts,
        public SearchCollection $searches,
        public FilterCollection $filters,
    ) {}

    public static function fromRequest(Request $request, ?QueryConfig $queryConfig = null): self
    {
        $queryConfig ??= QueryConfig::fromConfig();

        $page = max(1, (int) $request->query($queryConfig->page, 1));
        $defaultPerPage = (int) config('inertia-datatables.default_per_page', 25);
        $maxPerPage = (int) config('inertia-datatables.max_per_page', 100);
        $perPage = max(1, min($maxPerPage, (int) $request->query($queryConfig->perPage, $defaultPerPage)));

        $searchQuery = $request->query($queryConfig->search, '');
        $search = is_array($searchQuery) ? '' : (string) $searchQuery;

        $sorts = SortCollection::fromQueryString(
            (string) $request->query($queryConfig->sort, ''),
        );

        $searches = SearchCollection::fromRequest($request, $queryConfig->searches);

        $filters = FilterCollection::fromRequest($request, $queryConfig->filters);

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

    /**
     * @return array{page: int, per_page: int, search: string, sort: array<int, array{column: string, direction: string}>, searches: array<int, array{column: string, value: string}>, filters: array<int, array{column: string, value: mixed}>}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}

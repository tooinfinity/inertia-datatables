<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use TooInfinity\InertiaDataTables\Processing\QueryProcessor;

/**
 * @template TModel of Model
 */
final readonly class DataTable
{
    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  array<int, Column>  $columns
     */
    private function __construct(
        private EloquentBuilder|QueryBuilder $query,
        private array $columns = [],
        private ?string $defaultSortColumn = null,
        private string $defaultSortDirection = 'desc',
        private ?int $perPage = null,
    ) {}

    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return self<TModel>
     */
    public static function query(EloquentBuilder|QueryBuilder $query): self
    {
        return new self($query);
    }

    /**
     * @param  array<int, Column>  $columns
     * @return self<TModel>
     */
    public function columns(array $columns): self
    {
        return new self(
            query: $this->query,
            columns: $columns,
            defaultSortColumn: $this->defaultSortColumn,
            defaultSortDirection: $this->defaultSortDirection,
            perPage: $this->perPage,
        );
    }

    /**
     * @return self<TModel>
     */
    public function defaultSort(string $column, string $direction = 'desc'): self
    {
        return new self(
            query: $this->query,
            columns: $this->columns,
            defaultSortColumn: $column,
            defaultSortDirection: $direction,
            perPage: $this->perPage,
        );
    }

    /**
     * @return self<TModel>
     */
    public function perPage(int $perPage): self
    {
        return new self(
            query: $this->query,
            columns: $this->columns,
            defaultSortColumn: $this->defaultSortColumn,
            defaultSortDirection: $this->defaultSortDirection,
            perPage: $perPage,
        );
    }

    /**
     * @return DataTableResult<TModel>
     */
    public function handle(?DataTableRequest $request = null): DataTableResult
    {
        $request ??= app(DataTableRequest::class);

        return new QueryProcessor($this->columns)->process($this->query, $request, $this->defaultSortColumn, $this->defaultSortDirection, $this->perPage);
    }
}

<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;
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
     * @template TNewModel of Model
     *
     * @param  EloquentBuilder<TNewModel>|QueryBuilder  $query
     * @return self<TNewModel>
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
        $newTable = new self(
            query: $this->query,
            columns: $columns,
            defaultSortColumn: $this->defaultSortColumn,
            defaultSortDirection: $this->defaultSortDirection,
            perPage: $this->perPage,
        );

        if ($newTable->defaultSortColumn !== null) {
            $newTable->validateDefaultSort($columns);
        }

        return $newTable;
    }

    /**
     * @return self<TModel>
     */
    public function defaultSort(string $column, string $direction = 'desc'): self
    {
        $normalizedDirection = strtolower($direction);
        if (! in_array($normalizedDirection, ['asc', 'desc'], true)) {
            throw InvalidSortException::invalidDirection($direction);
        }

        $newTable = new self(
            query: $this->query,
            columns: $this->columns,
            defaultSortColumn: $column,
            defaultSortDirection: $normalizedDirection,
            perPage: $this->perPage,
        );

        if ($newTable->columns !== []) {
            $newTable->validateDefaultSort($this->columns);
        }

        return $newTable;
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

        /** @var QueryProcessor<TModel> $processor */
        $processor = new QueryProcessor($this->columns);

        return $processor->process($this->query, $request, $this->defaultSortColumn, $this->defaultSortDirection, $this->perPage);
    }

    /**
     * @param  array<int, Column>  $columns
     */
    private function validateDefaultSort(array $columns): void
    {
        /** @var string $defaultSortColumn */
        $defaultSortColumn = $this->defaultSortColumn;

        $columnMap = [];

        foreach ($columns as $column) {
            $columnMap[$column->name] = $column;
        }

        if (! isset($columnMap[$defaultSortColumn])) {
            throw InvalidSortException::notAllowed($defaultSortColumn);
        }

        $column = $columnMap[$defaultSortColumn];

        if (! $column->sortable) {
            throw InvalidSortException::notAllowed($defaultSortColumn);
        }
    }
}

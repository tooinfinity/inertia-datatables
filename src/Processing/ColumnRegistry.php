<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidFilterException;
use TooInfinity\InertiaDataTables\Exceptions\InvalidSortException;

/**
 * Indexed column lookup with up-front request validation and field/alias resolution.
 *
 * @internal
 */
final readonly class ColumnRegistry
{
    /**
     * Columns indexed by name for O(1) lookup.
     *
     * @var array<string, Column>
     */
    private array $index;

    /**
     * @param  array<int, Column>  $columns
     * @param  array<int, string>  $responseKeys
     */
    public function __construct(
        private array $columns,
        private array $responseKeys = [],
    ) {
        $index = [];
        foreach ($columns as $column) {
            $index[$column->name] = $column;
        }
        $this->index = $index;
    }

    /**
     * Find a column by name or throw if not declared.
     */
    public function find(string $name): Column
    {
        if (isset($this->index[$name])) {
            return $this->index[$name];
        }

        throw InvalidColumnException::notFound($name);
    }

    /**
     * Validate that every sort, filter, and search in the request names a declared column.
     *
     * Existence is the only thing checked here; filterable/searchable/sortable
     * constraints are enforced when each operation is applied.
     */
    public function validateRequest(\TooInfinity\InertiaDataTables\DataTableRequest $request): void
    {
        foreach ($request->sorts->all() as $sort) {
            if (! isset($this->index[$sort->column])) {
                throw InvalidSortException::notAllowed($sort->column)->forRequest();
            }
        }

        foreach ($request->filters->all() as $filter) {
            if (! isset($this->index[$filter->column])) {
                throw InvalidFilterException::notAllowed($filter->column)->forRequest();
            }
        }

        foreach ($request->searches->all() as $search) {
            if (! isset($this->index[$search->column])) {
                throw InvalidColumnException::notAllowed($search->column, 'search')->forRequest();
            }
        }
    }

    /**
     * The database expression a column is searched, sorted, and filtered with.
     */
    public function fieldExpression(Column $column): string
    {
        $field = $column->field ?? $column->name;

        return $this->withoutAlias($field);
    }

    /**
     * The select expression that exposes the database expression of a column.
     */
    public function aliasedField(Column $column): string
    {
        $field = $column->field ?? $column->name;

        if ($this->hasAlias($field)) {
            return $field;
        }

        return $field.' as '.$column->name;
    }

    /**
     * Select the database expression of every column that declares one.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  \Illuminate\Database\Eloquent\Builder<TModel>|\Illuminate\Database\Query\Builder  $query
     */
    public function applyColumnFields(\Illuminate\Database\Eloquent\Builder|\Illuminate\Database\Query\Builder $query): void
    {
        $queryBuilder = $query instanceof \Illuminate\Database\Eloquent\Builder ? $query->getQuery() : $query;
        $qualifier = $this->tableQualifier($queryBuilder->from);

        foreach ($this->columns as $column) {
            if ($column->field === null || $column->relation !== null || $column->value !== null) {
                continue;
            }

            if ($queryBuilder->columns === null) {
                $queryBuilder->select($qualifier !== null ? $qualifier.'.*' : '*');
            }

            $queryBuilder->addSelect($this->aliasedField($column));
        }

        if ($this->responseKeys === []) {
            return;
        }

        $selectedAliases = array_column((new Projection)->items($queryBuilder), 'alias');

        // Resolve the table's column listing once so response keys are not
        // re-checked against the schema for every key.
        $databaseColumns = [];
        if ($query instanceof \Illuminate\Database\Eloquent\Builder) {
            // Do not silently treat a failed schema lookup as an empty table:
            // doing so would omit valid response keys and return incomplete data.
            // Let the original database/schema exception surface to the caller.
            $databaseColumns = $query->getModel()->getConnection()
                ->getSchemaBuilder()
                ->getColumnListing($query->getModel()->getTable());
        }

        foreach ($this->responseKeys as $responseKey) {
            // Relation keys are eager-loaded separately; only plain attributes
            // can be selected directly in the SQL projection.
            if (str_contains($responseKey, '.')) {
                continue;
            }

            // Preserve values already selected under the requested output name.
            if (in_array($responseKey, $selectedAliases, true)) {
                continue;
            }

            // Eloquent models may expose computed attributes (accessors / appends)
            // that are not database columns. Only select response keys that are
            // real columns so we never emit SQL for an unknown column. Query
            // Builder results have no computed attributes, so every key is a
            // valid SQL column there.
            if ($query instanceof \Illuminate\Database\Eloquent\Builder && ! in_array($responseKey, $databaseColumns, true)) {
                continue;
            }

            if ($queryBuilder->columns === null) {
                $queryBuilder->select($qualifier !== null ? $qualifier.'.*' : '*');
            }

            $queryBuilder->addSelect($qualifier !== null ? $qualifier.'.'.$responseKey : $responseKey);
        }
    }

    /**
     * Resolve the active table qualifier or alias used by the query.
     */
    public function tableQualifier(mixed $from): ?string
    {
        if (! is_string($from)) {
            return null;
        }

        $from = trim($from);

        if ($from === '') {
            return null;
        }

        if (preg_match('/^(.*?)\s+(?:as\s+)?([^\s]+)$/i', $from, $matches) === 1) {
            return trim($matches[2], '`"');
        }

        $segments = explode('.', $from);
        $table = $segments[array_key_last($segments)];

        return trim($table, '`"');
    }

    /**
     * The table every column can be selected from (null when aliased or non-string).
     */
    public function plainTable(mixed $from): ?string
    {
        if (! is_string($from) || $this->hasAlias($from)) {
            return null;
        }

        return $from;
    }

    /**
     * @return array<int, Column>
     */
    public function all(): array
    {
        return $this->columns;
    }

    /**
     * Determine whether an expression contains an alias.
     */
    private function hasAlias(string $expression): bool
    {
        return stripos($expression, ' as ') !== false;
    }

    /**
     * Remove the alias of an expression so it can be used in a constraint.
     */
    private function withoutAlias(string $expression): string
    {
        $position = stripos($expression, ' as ');

        if ($position === false) {
            return $expression;
        }

        return substr($expression, 0, $position);
    }
}

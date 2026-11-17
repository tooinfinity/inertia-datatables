<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Illuminate\Contracts\Database\Query\Expression as ExpressionContract;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * Appends a deterministic tiebreaker ordering to paginated queries.
 *
 * @internal
 */
final readonly class StableOrdering
{
    public function __construct(
        private Projection $projection,
        private TableColumns $tableColumns,
    ) {}

    /**
     * Append a unique ordering column so pagination remains deterministic.
     *
     * Rows that share the sorted values may otherwise move between pages
     * because SQL does not guarantee a stable order. The tiebreaker is only
     * applied when the query shape allows a unique row key to be referenced.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    public function apply(EloquentBuilder|QueryBuilder $query): EloquentBuilder|QueryBuilder
    {
        $queryBuilder = $query instanceof EloquentBuilder
            ? $query->getQuery()
            : $query;

        if (($queryBuilder->unions ?? []) !== []) {
            return $this->applyUnion($query, $queryBuilder);
        }

        if (($queryBuilder->groups ?? []) !== []) {
            return $this->applyGrouped($query, $queryBuilder);
        }

        if (($queryBuilder->havings ?? []) !== []) {
            return $query;
        }

        $tiebreaker = $query instanceof EloquentBuilder
            ? $this->resolveEloquent($query, $queryBuilder)
            : $this->resolveQueryBuilder($queryBuilder);

        if ($tiebreaker === null) {
            return $query;
        }

        if ($this->isOrderedBy($queryBuilder, ...$tiebreaker['equivalents'])) {
            return $query;
        }

        return $query->orderBy($tiebreaker['column'], 'asc');
    }

    /**
     * Determine whether the query already contains one of the given order columns.
     */
    public function isOrderedBy(QueryBuilder $query, string ...$columns): bool
    {
        $orders = array_merge($query->orders ?? [], $query->unionOrders ?? []);

        foreach ($orders as $order) {
            if (! is_array($order)) {
                continue;
            }

            $column = $order['column'] ?? null;

            if ($column instanceof ExpressionContract) {
                $column = $column->getValue($query->getGrammar());
            }

            if (! is_string($column)) {
                continue;
            }

            $normalizedColumn = $this->projection->normalizeIdentifier($column);

            foreach ($columns as $orderedColumn) {
                if ($normalizedColumn === $this->projection->normalizeIdentifier($orderedColumn)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Order union results by the projected row key.
     *
     * A union is ordered by the column names of its output, so the row key is
     * referenced without a table qualifier.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyUnion(
        EloquentBuilder|QueryBuilder $query,
        QueryBuilder $queryBuilder,
    ): EloquentBuilder|QueryBuilder {
        $keyName = $query instanceof EloquentBuilder
            ? $query->getModel()->getKeyName()
            : 'id';

        $qualifier = $this->projection->tableQualifier($queryBuilder);
        $outputKey = $this->projection->findProjectedKeyOutput($queryBuilder, $keyName, $qualifier);

        if ($outputKey === null) {
            return $query;
        }

        if ($qualifier === null) {
            return $query;
        }

        if (! $this->keyIsAvailable($query, $queryBuilder, $keyName, $qualifier)) {
            return $query;
        }

        if ($this->isOrderedBy($queryBuilder, $outputKey, $keyName)) {
            return $query;
        }

        return $query->orderBy($outputKey, 'asc');
    }

    /**
     * Order grouped rows by their grouping columns.
     *
     * Raw group expressions cannot be reused as ordering terms because their
     * bindings and dialect-specific semantics may differ.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return EloquentBuilder<TModel>|QueryBuilder
     */
    private function applyGrouped(
        EloquentBuilder|QueryBuilder $query,
        QueryBuilder $queryBuilder,
    ): EloquentBuilder|QueryBuilder {
        $groups = $queryBuilder->groups ?? [];

        foreach ($groups as $group) {
            if (! is_string($group)) {
                return $query;
            }
        }

        if ($queryBuilder->distinct !== false && $queryBuilder->distinct !== true) {
            return $query;
        }

        $qualifier = $this->projection->tableQualifier($queryBuilder);
        $candidates = [];

        foreach ($groups as $group) {
            if (! $queryBuilder->distinct) {
                $candidates[] = ['column' => $group, 'equivalents' => [$group]];

                continue;
            }

            $candidate = $this->projection->findProjectedGroup($queryBuilder, $group, $qualifier);

            if ($candidate === null) {
                return $query;
            }

            $candidates[] = $candidate;
        }

        foreach ($candidates as $candidate) {
            if ($this->isOrderedBy($queryBuilder, ...$candidate['equivalents'])) {
                continue;
            }

            $query->orderBy($candidate['column'], 'asc');
        }

        return $query;
    }

    /**
     * Resolve the Eloquent row key that makes the ordering unique.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  EloquentBuilder<TModel>  $query
     * @return array{column: string, equivalents: array<int, string>}|null
     */
    private function resolveEloquent(
        EloquentBuilder $query,
        QueryBuilder $queryBuilder,
    ): ?array {
        $qualifier = $this->projection->tableQualifier($queryBuilder);

        if ($qualifier === null) {
            return null;
        }

        $keyName = $query->getModel()->getKeyName();
        $qualifiedKeyName = $qualifier.'.'.$keyName;

        if (! $this->keyIsAvailable($query, $queryBuilder, $keyName, $qualifier)) {
            return null;
        }

        if ($queryBuilder->distinct !== false) {
            if ($queryBuilder->distinct !== true) {
                return null;
            }

            return $this->projection->findProjectedKey($queryBuilder, $keyName, $qualifier, $qualifiedKeyName);
        }

        if ($this->projection->isAggregateOnly($queryBuilder)) {
            return null;
        }

        return [
            'column' => $qualifiedKeyName,
            'equivalents' => array_values(array_unique([$qualifiedKeyName, $keyName])),
        ];
    }

    /**
     * Resolve the Query Builder row key that makes the ordering unique.
     *
     * @return array{column: string, equivalents: array<int, string>}|null
     */
    private function resolveQueryBuilder(QueryBuilder $queryBuilder): ?array
    {
        $keyName = 'id';
        $qualifier = $this->projection->tableQualifier($queryBuilder);

        if ($qualifier === null) {
            return null;
        }

        $hasJoins = ($queryBuilder->joins ?? []) !== [];

        if ($queryBuilder->distinct !== false) {
            if ($queryBuilder->distinct !== true) {
                return null;
            }

            $wildcardKey = $hasJoins ? $qualifier.'.'.$keyName : $keyName;
            $candidate = $this->projection->findProjectedKey($queryBuilder, $keyName, $qualifier, $wildcardKey);

            if ($candidate === null) {
                return null;
            }

            if (! $this->keyIsAvailable($queryBuilder, $queryBuilder, $keyName, $qualifier)) {
                return null;
            }

            return $candidate;
        }

        if ($this->projection->isAggregateOnly($queryBuilder)) {
            return null;
        }

        if (! $this->keyIsAvailable($queryBuilder, $queryBuilder, $keyName, $qualifier)) {
            return null;
        }

        if ($hasJoins) {
            $qualifiedKeyName = $qualifier.'.'.$keyName;

            return [
                'column' => $qualifiedKeyName,
                'equivalents' => array_values(array_unique([$qualifiedKeyName, $keyName])),
            ];
        }

        return [
            'column' => $keyName,
            'equivalents' => [$keyName],
        ];
    }

    /**
     * Determine whether the row key can safely be referenced by the query.
     *
     * The key of an Eloquent model is trusted for the table of the model. Any
     * other source is checked against the columns of the table, because the
     * generated ordering term would fail for tables without that column.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    private function keyIsAvailable(
        EloquentBuilder|QueryBuilder $query,
        QueryBuilder $queryBuilder,
        string $keyName,
        string $qualifier,
    ): bool {
        $baseTable = $this->projection->baseTable($queryBuilder->from);

        if ($baseTable === null) {
            return false;
        }

        if ($query instanceof EloquentBuilder) {
            if ($this->projection->sameTable($baseTable, $query->getModel()->getTable())) {
                return true;
            }

            return $this->tableColumns->hasColumn($queryBuilder->getConnection(), $baseTable, $keyName);
        }

        $hasJoins = ($queryBuilder->joins ?? []) !== [];

        if (! $hasJoins && $this->projection->includesKey($queryBuilder, $keyName, $qualifier)) {
            return true;
        }

        return $this->tableColumns->hasColumn($queryBuilder->getConnection(), $baseTable, $keyName);
    }
}

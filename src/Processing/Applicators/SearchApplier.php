<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing\Applicators;

use Closure;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\PostgresConnection;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Database\Query\Expression;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\DataTableRequest;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;
use TooInfinity\InertiaDataTables\Processing\ColumnRegistry;
use TooInfinity\InertiaDataTables\Processing\RelationResolver;

/**
 * Applies global and per-column search constraints to database queries.
 *
 * @internal
 */
final readonly class SearchApplier
{
    public function __construct(
        private ColumnRegistry $registry,
        private RelationResolver $relations,
    ) {}

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    public function applyGlobal(EloquentBuilder|QueryBuilder $query, DataTableRequest $request): void
    {
        $search = $request->search;

        if ($search === '') {
            return;
        }

        $searchableColumns = array_filter($this->registry->all(), fn (Column $c): bool => $c->searchable);

        if ($searchableColumns === []) {
            return;
        }

        $escaped = $this->escapeLikeValue($search);

        $query->where(function (EloquentBuilder|QueryBuilder $q) use ($escaped, $searchableColumns): void {
            foreach ($searchableColumns as $column) {
                $this->applySearchToColumn($q, $column, $escaped, 'or');
            }
        });
    }

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     */
    public function applyColumns(EloquentBuilder|QueryBuilder $query, DataTableRequest $request): void
    {
        foreach ($request->searches->all() as $search) {
            $column = $this->registry->find($search->column);

            if (! $column->searchable) {
                throw InvalidColumnException::notAllowed($search->column, 'search')->forRequest();
            }

            $escaped = $this->escapeLikeValue($search->value);

            $this->applySearchToColumn($query, $column, $escaped, 'and');
        }
    }

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'and'|'or'  $boolean
     */
    public function applySearchToColumn(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $term,
        string $boolean,
    ): void {
        if ($column->searchUsing instanceof Closure) {
            ($column->searchUsing)($query, $term, $boolean);

            return;
        }

        if ($column->relation !== null) {
            $this->applyRelationSearch($query, $column, $term, $boolean);

            return;
        }

        $this->applyLike($query, $this->registry->fieldExpression($column), "%{$term}%", $boolean);
    }

    /**
     * @template TModel of Model
     *
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @param  'and'|'or'  $boolean
     */
    public function applyRelationSearch(
        EloquentBuilder|QueryBuilder $query,
        Column $column,
        string $term,
        string $boolean,
    ): void {
        $resolved = $this->relations->resolve($query, $column);

        $resolved['eloquent']->has($this->relations->relationName($column), '>=', 1, $boolean, function (EloquentBuilder $related) use ($resolved, $term): void {
            $this->applyLike($related, $resolved['link']->relatedColumn, "%{$term}%");
        });
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @param  'and'|'or'  $boolean
     */
    public function applyLike(
        EloquentBuilder|QueryBuilder $query,
        string $column,
        string $pattern,
        string $boolean = 'and',
    ): void {
        $queryBuilder = $query instanceof EloquentBuilder
            ? $query->getQuery()
            : $query;

        // Keep the pattern bound while placing the portable escape clause after its placeholder.
        $queryBuilder->where(
            $column,
            $this->likeOperator($queryBuilder),
            new Expression("? ESCAPE '!'"),
            $boolean,
        );
        $queryBuilder->addBinding($pattern);
    }

    /**
     * Resolve the case-insensitive LIKE operator for the underlying connection.
     */
    public function likeOperator(QueryBuilder $queryBuilder): string
    {
        return $queryBuilder->getConnection() instanceof PostgresConnection
            ? 'ilike'
            : 'like';
    }

    public function escapeLikeValue(string $value, bool $allowWildcards = false): string
    {
        $value = str_replace(
            ['!', '%', '_', '\\'],
            ['!!', '!%', '!_', '!\\'],
            $value,
        );

        if ($allowWildcards) {
            $value = str_replace('*', '%', $value);
        }

        return $value;
    }
}

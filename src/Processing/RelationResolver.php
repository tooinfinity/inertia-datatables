<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder as QueryBuilder;
use ReflectionMethod;
use TooInfinity\InertiaDataTables\Column;
use TooInfinity\InertiaDataTables\Exceptions\InvalidColumnException;

/**
 * Resolves Eloquent relationships, their metadata, and linkages for columns.
 *
 * @internal
 */
final readonly class RelationResolver
{
    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @return EloquentBuilder<TQueryModel>
     */
    public function eloquentQuery(EloquentBuilder|QueryBuilder $query, Column $column): EloquentBuilder
    {
        if ($query instanceof EloquentBuilder) {
            return $query;
        }

        throw InvalidColumnException::relationRequiresEloquent($column->name);
    }

    /**
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>  $query
     * @return Relation<Model, Model, mixed>
     */
    public function relationFor(EloquentBuilder $query, Column $column): Relation
    {
        $name = $column->relation ?? '';

        $instance = $query->getModel()->newInstance();

        if ($name === '' || ! method_exists($instance, $name)) {
            throw InvalidColumnException::unknownRelation($column->name, $name);
        }

        $method = new ReflectionMethod($instance, $name);

        if (! $method->isPublic()) {
            throw InvalidColumnException::unknownRelation($column->name, $name);
        }

        $relation = Relation::noConstraints(fn (): mixed => $method->invoke($instance));

        if (! $relation instanceof Relation) {
            throw InvalidColumnException::unknownRelation($column->name, $name);
        }

        return $relation;
    }

    /**
     * Describe how the related row is linked to the parent row.
     *
     * @param  Relation<Model, Model, mixed>  $relation
     */
    public function metadata(Relation $relation, Column $column): RelationLink
    {
        $parent = $relation->getParent();
        $related = $relation->getRelated();

        if ($relation instanceof BelongsTo) {
            return new RelationLink(
                relatedTable: $related->getTable(),
                relatedColumn: $column->relationColumn ?? $relation->getOwnerKeyName(),
                relatedKey: $relation->getOwnerKeyName(),
                parentTable: $parent->getTable(),
                parentKey: $relation->getForeignKeyName(),
            );
        }

        if ($relation instanceof HasOne) {
            return new RelationLink(
                relatedTable: $related->getTable(),
                relatedColumn: $column->relationColumn ?? $related->getKeyName(),
                relatedKey: $relation->getForeignKeyName(),
                parentTable: $parent->getTable(),
                parentKey: $relation->getLocalKeyName(),
            );
        }

        throw InvalidColumnException::unsupportedRelation($column->name, $column->relation ?? '');
    }

    /**
     * The relationship name a column reads its value from.
     */
    public function relationName(Column $column): string
    {
        $relation = $column->relation;

        if ($relation === null) {
            throw InvalidColumnException::unknownRelation($column->name, '');
        }

        return $relation;
    }

    /**
     * Eager load every relationship a column reads its value from.
     *
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @param  array<int, Column>  $columns
     */
    public function applyRelationLoads(EloquentBuilder|QueryBuilder $query, array $columns): void
    {
        $relations = [];
        $relationColumn = null;

        foreach ($columns as $column) {
            if ($column->relation === null) {
                continue;
            }

            $relations[$column->relation] = $column->relation;
            $relationColumn ??= $column;
        }

        if ($relations === [] || $relationColumn === null) {
            return;
        }

        $this->eloquentQuery($query, $relationColumn)->with(array_values($relations));
    }

    /**
     * Resolve the Eloquent query, relation instance, and link metadata together.
     *
     * @template TQueryModel of Model
     *
     * @param  EloquentBuilder<TQueryModel>|QueryBuilder  $query
     * @return array{eloquent: EloquentBuilder<TQueryModel>, relation: Relation<Model, Model, mixed>, link: RelationLink}
     */
    public function resolve(EloquentBuilder|QueryBuilder $query, Column $column): array
    {
        $eloquent = $this->eloquentQuery($query, $column);
        $relation = $this->relationFor($eloquent, $column);
        $link = $this->metadata($relation, $column);

        return [
            'eloquent' => $eloquent,
            'relation' => $relation,
            'link' => $link,
        ];
    }
}

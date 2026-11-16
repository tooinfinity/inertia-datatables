<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Exceptions;

final class InvalidColumnException extends InvalidDataTableException
{
    public static function notAllowed(string $column, string $operation): self
    {
        return new self(
            sprintf('Column [%s] is not allowed for %s.', $column, $operation),
        );
    }

    public static function notFound(string $column): self
    {
        return new self(
            sprintf('Column [%s] not found in column definitions.', $column),
        );
    }

    public static function unknownRelation(string $column, string $relation): self
    {
        return new self(
            sprintf('Column [%s] declares an unknown relationship [%s].', $column, $relation),
        );
    }

    public static function unsupportedRelation(string $column, string $relation): self
    {
        return new self(
            sprintf('Column [%s] cannot read a value from the relationship [%s]. Only belongs to and has one relationships are supported.', $column, $relation),
        );
    }

    public static function relationRequiresEloquent(string $column): self
    {
        return new self(
            sprintf('Column [%s] reads its value from a relationship and requires an Eloquent query.', $column),
        );
    }
}

<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Exceptions;

use InvalidArgumentException;

final class InvalidFilterException extends InvalidArgumentException
{
    public static function notAllowed(string $column): self
    {
        return new self(
            sprintf('Column [%s] is not filterable.', $column),
        );
    }

    public static function invalidValue(string $column, mixed $value): self
    {
        return new self(
            sprintf('Invalid filter value for column [%s]: %s', $column, json_encode($value)),
        );
    }
}

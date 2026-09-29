<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Exceptions;

use InvalidArgumentException;

final class InvalidColumnException extends InvalidArgumentException
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
}

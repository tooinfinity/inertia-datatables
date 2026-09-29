<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Exceptions;

use InvalidArgumentException;

final class InvalidSortException extends InvalidArgumentException
{
    public static function notAllowed(string $column): self
    {
        return new self(
            sprintf('Column [%s] is not sortable.', $column),
        );
    }

    public static function invalidDirection(string $direction): self
    {
        return new self(
            sprintf('Invalid sort direction [%s]. Expected "asc" or "desc".', $direction),
        );
    }
}

<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Query;

final class ColumnResolver
{
    public static function resolve(string $column): string
    {
        return $column;
    }
}

<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Query\Builder as QueryBuilder;

final class InertiaDataTables
{
    public static function query(EloquentBuilder|QueryBuilder $query): DataTable
    {
        return DataTable::query($query);
    }
}

<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * @template TModel of Model
 */
final class InertiaDataTables
{
    /**
     * @param  EloquentBuilder<TModel>|QueryBuilder  $query
     * @return DataTable<TModel>
     */
    public static function query(EloquentBuilder|QueryBuilder $query): DataTable
    {
        return DataTable::query($query);
    }
}

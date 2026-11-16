<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Processing;

use Illuminate\Database\Connection;
use Illuminate\Database\ConnectionInterface;
use WeakMap;

/**
 * Cached column lookups for database tables.
 *
 * The package uses these lookups to decide whether a row key can safely be
 * referenced in an ordering term. Results are cached per connection, so a
 * table is inspected at most once per request.
 *
 * @internal
 */
final class TableColumns
{
    /**
     * @var WeakMap<ConnectionInterface, array<string, bool>>
     */
    private WeakMap $cache;

    public function __construct()
    {
        $this->cache = new WeakMap;
    }

    /**
     * Determine whether the given table contains the given column.
     */
    public function hasColumn(ConnectionInterface $connection, string $table, string $column): bool
    {
        $columns = $this->cache[$connection] ?? [];
        $key = $table.'|'.$column;

        if (isset($columns[$key])) {
            return $columns[$key];
        }

        $exists = $connection instanceof Connection
            && $connection->getSchemaBuilder()->hasColumn($table, $column);

        $columns[$key] = $exists;
        $this->cache[$connection] = $columns;

        return $exists;
    }
}

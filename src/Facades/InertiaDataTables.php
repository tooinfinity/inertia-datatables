<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @see \TooInfinity\InertiaDataTables\InertiaDataTables
 */
final class InertiaDataTables extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return \TooInfinity\InertiaDataTables\InertiaDataTables::class;
    }
}

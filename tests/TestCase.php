<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Tests;

use Orchestra\Testbench\TestCase as Orchestra;
use TooInfinity\InertiaDataTables\InertiaDataTablesServiceProvider;

abstract class TestCase extends Orchestra
{
    protected function getPackageProviders($app): array
    {
        return [
            InertiaDataTablesServiceProvider::class,
        ];
    }

    protected function getPackageFactories($app): array
    {
        return [
            Workbench\Database\Factories\UserFactory::class,
        ];
    }

    protected function defineEnvironment($app): void
    {
        $app['config']->set('database.default', 'sqlite');
        $app['config']->set('database.connections.sqlite', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
        ]);
    }
}

<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Tests;

use Orchestra\Testbench\TestCase as Orchestra;
use TooInfinity\InertiaDataTables\InertiaDataTablesServiceProvider;
use Workbench\Database\Factories\UserFactory;

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
            UserFactory::class,
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
        $app['config']->set('hashing.bcrypt.rounds', 4);
    }
}

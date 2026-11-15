<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Tests;

use Illuminate\Support\Env;
use Orchestra\Testbench\TestCase as Orchestra;
use TooInfinity\InertiaDataTables\InertiaDataTablesServiceProvider;
use Workbench\Database\Factories\UserFactory;

abstract class TestCase extends Orchestra
{
    /**
     * Release the database connection after every test.
     *
     * Testbench rebuilds the application for each test, which leaves the previous
     * PDO handle open. That is harmless for SQLite's in-memory database, but a
     * real server would quickly run out of connections.
     */
    protected function tearDown(): void
    {
        if ($this->app !== null) {
            $this->app['db']->disconnect();
        }

        parent::tearDown();
    }

    /**
     * The database connection the suite runs against.
     */
    public static function databaseConnection(): string
    {
        $connection = Env::get('DB_CONNECTION');

        return is_string($connection) && $connection !== ''
            ? $connection
            : 'sqlite';
    }

    /**
     * The connection configuration for the given driver.
     *
     * @return array<string, mixed>
     */
    public static function databaseConfiguration(string $connection): array
    {
        $prefix = static::tablePrefix();

        return match ($connection) {
            'mysql' => [
                'driver' => 'mysql',
                'host' => Env::get('DB_HOST', '127.0.0.1'),
                'port' => Env::get('DB_PORT', '3306'),
                'database' => Env::get('DB_DATABASE', 'inertia_datatables'),
                'username' => Env::get('DB_USERNAME', 'root'),
                'password' => Env::get('DB_PASSWORD', ''),
                'unix_socket' => Env::get('DB_SOCKET', ''),
                'charset' => 'utf8mb4',
                'collation' => 'utf8mb4_unicode_ci',
                'prefix' => $prefix,
                'prefix_indexes' => true,
                'strict' => true,
                'engine' => null,
            ],
            'pgsql' => [
                'driver' => 'pgsql',
                'host' => Env::get('DB_HOST', '127.0.0.1'),
                'port' => Env::get('DB_PORT', '5432'),
                'database' => Env::get('DB_DATABASE', 'inertia_datatables'),
                'username' => Env::get('DB_USERNAME', 'postgres'),
                'password' => Env::get('DB_PASSWORD', ''),
                'charset' => 'utf8',
                'prefix' => $prefix,
                'prefix_indexes' => true,
                'search_path' => 'public',
                'sslmode' => 'prefer',
            ],
            default => [
                'driver' => 'sqlite',
                'database' => Env::get('DB_DATABASE', ':memory:'),
                'prefix' => $prefix,
                'foreign_key_constraints' => Env::get('DB_FOREIGN_KEYS', true),
            ],
        };
    }

    /**
     * The table prefix isolating this process from other parallel workers.
     *
     * Every test creates and drops its own tables, so parallel workers sharing
     * a single database would race on the same table names. SQLite keeps an
     * in-memory database per connection and never needs the prefix.
     */
    public static function tablePrefix(): string
    {
        if (static::databaseConnection() === 'sqlite') {
            return '';
        }

        $token = Env::get('TEST_TOKEN');

        return is_string($token) && $token !== ''
            ? 'test_'.$token.'_'
            : 'test_main_';
    }

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
        $connection = static::databaseConnection();

        $app['config']->set('database.default', $connection);
        $app['config']->set('database.connections.'.$connection, static::databaseConfiguration($connection));
        $app['config']->set('hashing.bcrypt.rounds', 4);
    }
}

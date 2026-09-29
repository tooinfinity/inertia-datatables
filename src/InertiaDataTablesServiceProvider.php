<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Support\ServiceProvider;

final class InertiaDataTablesServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/inertia-datatables.php', 'inertia-datatables');

        $this->app->singleton(InertiaDataTables::class);

        /** @var array{page: string, per_page: string, search: string, sort: string, filters: string} $queryConfig */
        $queryConfig = config('inertia-datatables.query', [
            'page' => 'page',
            'per_page' => 'per_page',
            'search' => 'search',
            'sort' => 'sort',
            'filters' => 'filters',
        ]);

        $this->app->singleton(DataTableRequest::class, fn (): DataTableRequest => DataTableRequest::fromRequest(
            request(),
            $queryConfig,
        ));
    }

    public function boot(): void
    {
        if (! $this->app->runningInConsole()) {
            return;
        }

        $this->publishes([
            __DIR__.'/../config/inertia-datatables.php' => config_path('inertia-datatables.php'),
        ], ['inertia-datatables', 'inertia-datatables-config']);
    }
}

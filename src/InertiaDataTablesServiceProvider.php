<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables;

use Illuminate\Support\ServiceProvider;
use Override;

final class InertiaDataTablesServiceProvider extends ServiceProvider
{
    #[Override]
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/inertia-datatables.php', 'inertia-datatables');

        $this->app->singleton(InertiaDataTables::class);

        $this->app->bind(DataTableRequest::class, fn (): DataTableRequest => DataTableRequest::fromRequest(request()));
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

<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Tests;

use Workbench\App\Models\User;

trait CreatesUsers
{
    protected function createUser(array $attributes = []): User
    {
        return User::create(array_merge([
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'status' => 'active',
            'password' => 'password',
        ], $attributes));
    }
}

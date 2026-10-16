<?php

declare(strict_types=1);

namespace TooInfinity\InertiaDataTables\Tests;

use Workbench\App\Models\User;

trait CreatesUsers
{
    protected function createUser(array $attributes = []): User
    {
        static $password;

        return User::create(array_merge([
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'status' => 'active',
            'password' => $password ??= '$2y$04$wT3wY2K7dKjMh6H7R9uIhe9Zz3E3O6B2I5l9h.8P7v4n3S3T4k6W2',
        ], $attributes));
    }
}

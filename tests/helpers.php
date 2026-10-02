<?php

declare(strict_types=1);

use Workbench\App\Models\User;

function createUser(array $attributes = []): User
{
    return User::create(array_merge([
        'name' => fake()->name(),
        'email' => fake()->unique()->safeEmail(),
        'status' => 'active',
        'password' => 'password',
    ], $attributes));
}
